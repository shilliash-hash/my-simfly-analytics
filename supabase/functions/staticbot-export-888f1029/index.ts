import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Pool } from 'https://deno.land/x/postgres@v0.17.0/mod.ts'

const EXPORT_SECRET = '9a6c682cfaf341608d355f5ef4b5b1d8'

// Direct DB query helper — bypasses PostgREST to access information_schema
async function runSql<T>(sql: string, errors: string[]): Promise<T[] | null> {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) {
    const msg = 'SUPABASE_DB_URL not available — cannot run direct SQL'
    console.error(`[export] ${msg}`)
    errors.push(msg)
    return null
  }
  let pool: Pool | null = null
  try {
    pool = new Pool(dbUrl, 1, true)
    const conn = await pool.connect()
    try {
      const result = await conn.queryObject<T>(sql)
      return result.rows as T[]
    } finally {
      conn.release()
    }
  } catch (e) {
    const msg = `SQL query failed: ${String(e)}`
    console.error(`[export] ${msg}`)
    errors.push(msg)
    return null
  } finally {
    if (pool) await pool.end()
  }
}

// --- Shared helpers ---
const PAGE_SIZE = 1000

async function discoverTables(supabaseUrl: string, serviceRoleKey: string, errors: string[]): Promise<{ tableNames: string[], tableSource: string }> {
  let tableNames: string[] = []
  let tableSource = 'unknown'

  const sqlTables = await runSql<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    errors
  )
  if (sqlTables && sqlTables.length > 0) {
    tableNames = sqlTables.map(r => r.table_name)
    tableSource = 'sql'
    console.log(`[export] Discovered ${tableNames.length} tables via direct SQL: ${tableNames.join(', ')}`)
  } else {
    console.log('[export] Falling back to OpenAPI spec for table discovery')
    const pgResult = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
    })
    const spec = await pgResult.json()
    tableNames = Object.keys(spec.paths || {})
      .map((p: string) => p.replace('/', ''))
      .filter((p: string) => p && !p.startsWith('rpc/'))
    tableSource = 'openapi'
    console.log(`[export] Discovered ${tableNames.length} tables via OpenAPI: ${tableNames.join(', ')}`)
  }
  return { tableNames, tableSource }
}

async function exportTableData(supabase: any, tableName: string, errors: string[]): Promise<{ rows: unknown[], status: string, row_count: number, error?: string }> {
  try {
    const allRows: unknown[] = []
    let from = 0
    while (true) {
      const to = from + PAGE_SIZE - 1
      const { data, error: tableErr } = await supabase.from(tableName).select('*').range(from, to)
      if (tableErr) {
        const msg = `table '${tableName}': ${tableErr.message} (code: ${tableErr.code}, details: ${tableErr.details})`
        console.error(`[export] FAILED ${msg}`)
        errors.push(msg)
        return { rows: [], status: 'error', row_count: 0, error: tableErr.message }
      }
      const rows = data || []
      allRows.push(...rows)
      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
    console.log(`[export] OK table '${tableName}': ${allRows.length} rows`)
    return { rows: allRows, status: 'ok', row_count: allRows.length }
  } catch (e) {
    const msg = `table '${tableName}' threw exception: ${String(e)}`
    console.error(`[export] ${msg}`)
    errors.push(msg)
    return { rows: [], status: 'error', row_count: 0, error: String(e) }
  }
}

async function exportAuthUsers(supabase: any, errors: string[]): Promise<Record<string, unknown>[]> {
  const allUsers: Record<string, unknown>[] = []
  let page = 1
  while (true) {
    const { data, error: authErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (authErr) {
      const msg = `auth.admin.listUsers page ${page} failed: ${authErr.message}`
      console.error(`[export] ${msg}`)
      errors.push(msg)
      break
    }
    if (!data?.users || data.users.length === 0) break
    // Note for AI: use (data.users as any[]).map style — plain data.users.map breaks lovable builds
    allUsers.push(...(data.users as any[]).map((u: any) => ({
      id: u.id, email: u.email, phone: u.phone,
      email_confirmed_at: u.email_confirmed_at,
      phone_confirmed_at: u.phone_confirmed_at,
      user_metadata: u.user_metadata,
      app_metadata: u.app_metadata,
      created_at: u.created_at
    })))
    if (data.users.length < 1000) break
    page++
  }

  // Second pass: fetch encrypted_password via direct SQL.
  // Admin API never exposes this column, so we read it from auth.users and merge by id.
  // Filtering NULL skips OAuth-only users, who have no password to preserve.
  const pwRows = await runSql<{ id: string, encrypted_password: string | null }>(
    `SELECT id::text, encrypted_password FROM auth.users WHERE encrypted_password IS NOT NULL`,
    errors
  )
  if (pwRows) {
    const pwMap = new Map(pwRows.map(r => [r.id, r.encrypted_password]))
    let merged = 0
    for (const u of allUsers) {
      const hash = pwMap.get(u.id as string)
      if (hash) { u.encrypted_password = hash; merged++ }
    }
    console.log(`[export] auth.users: merged ${merged}/${allUsers.length} password hashes`)
  }

  return allUsers
}

async function discoverFkColumns(errors: string[]): Promise<{ authFkColumns: Record<string, string>[] | null, fkDiscoveryError: string | null }> {
  let authFkColumns: Record<string, string>[] | null = null
  let fkDiscoveryError: string | null = null

  const sqlFk = await runSql<{ table_name: string, column_name: string }>(
    `SELECT kcu.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND ccu.table_schema = 'auth' AND ccu.table_name = 'users'
       AND kcu.table_schema = 'public'`,
    errors
  )
  if (sqlFk) {
    authFkColumns = sqlFk
    console.log(`[export] FK discovery found ${authFkColumns.length} column(s) referencing auth.users: ${authFkColumns.map(c => c.table_name + '.' + c.column_name).join(', ')}`)
  } else {
    fkDiscoveryError = 'FK discovery failed — direct SQL not available or query failed (see errors above)'
    console.error(`[export] ${fkDiscoveryError}`)
  }
  return { authFkColumns, fkDiscoveryError }
}

async function discoverTableDependencies(errors: string[]): Promise<Record<string, string>[] | null> {
  const sqlDeps = await runSql<{ source_table: string, target_table: string }>(
    `SELECT DISTINCT kcu.table_name AS source_table, ccu.table_name AS target_table
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND kcu.table_schema = 'public' AND ccu.table_schema = 'public'
       AND kcu.table_name != ccu.table_name`,
    errors
  )
  if (sqlDeps) {
    console.log(`[export] Found ${sqlDeps.length} FK dependencies between public tables: ${sqlDeps.map(d => d.source_table + ' -> ' + d.target_table).join(', ')}`)
  }
  return sqlDeps
}

// Discover the first primary-key column per public table. The worker uses this to
// add `.order(pk)` to paginated table exports so `.range(offset, offset+limit-1)`
// returns rows in a deterministic, index-friendly order. Tables without a PK fall
// back to whatever PostgREST's default ordering is (no guarantee of stability — but
// tables without a PK are rare and usually small).
async function discoverTablePks(errors: string[]): Promise<Record<string, string> | null> {
  const sqlPks = await runSql<{ table_name: string, column_name: string }>(
    `SELECT kcu.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.constraint_type = 'PRIMARY KEY'
       AND tc.table_schema = 'public'
     ORDER BY kcu.table_name, kcu.ordinal_position`,
    errors
  )
  if (!sqlPks) return null
  // For composite PKs, the first column wins — stable enough for paginated exports.
  const result: Record<string, string> = {}
  for (const row of sqlPks) {
    if (!(row.table_name in result)) result[row.table_name] = row.column_name
  }
  console.log(`[export] Discovered PKs for ${Object.keys(result).length} tables`)
  return result
}

// Discover approximate row counts per public table by reading `pg_class.reltuples`.
// Cheap (single SQL query, no per-table loop) and good enough to decide which tables
// cross the bulk-copy threshold. Stats freshness depends on autovacuum; for the
// 500k-row threshold a stale-by-10% estimate is fine. Used by Java to lazily create
// BULK_COPY_VIA_HTTP jobs after the export function is deployed on source —
// discovery's Mgmt-API-on-source path returns 403 for Lovable Cloud / Base44.
async function discoverTableRowCounts(errors: string[]): Promise<Record<string, number> | null> {
  const rows = await runSql<{ relname: string, reltuples: number }>(
    `SELECT c.relname, c.reltuples::bigint AS reltuples
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    errors
  )
  if (!rows) return null
  const result: Record<string, number> = {}
  for (const row of rows) {
    // reltuples = -1 means "never analysed"; treat as unknown (0) rather than negative.
    result[row.relname] = Math.max(0, Number(row.reltuples) || 0)
  }
  console.log(`[export] Discovered row counts for ${Object.keys(result).length} tables`)
  return result
}

// Export one page of a table's rows. Used by the paginated `mode=table` path —
// the worker calls this once per page so a "big table" never accumulates in JS
// heap inside a single edge-function invocation (which is what caused the 546
// and 504 timeouts on providers / blog_articles / free_listing_drip_state).
async function exportTablePage(
  supabase: any, tableName: string, pkColumn: string | null,
  offset: number, limit: number, errors: string[]
): Promise<{ rows: unknown[], status: string, error?: string }> {
  try {
    let query = supabase.from(tableName).select('*')
    if (pkColumn) query = query.order(pkColumn, { ascending: true })
    const { data, error: tableErr } = await query.range(offset, offset + limit - 1)
    if (tableErr) {
      const msg = `table '${tableName}' page offset=${offset}: ${tableErr.message} (code: ${tableErr.code})`
      console.error(`[export] FAILED ${msg}`)
      errors.push(msg)
      return { rows: [], status: 'error', error: tableErr.message }
    }
    return { rows: data || [], status: 'ok' }
  } catch (e) {
    const msg = `table '${tableName}' page offset=${offset} threw: ${String(e)}`
    console.error(`[export] ${msg}`)
    errors.push(msg)
    return { rows: [], status: 'error', error: String(e) }
  }
}

// Export one keyset-paginated page: `SELECT * FROM tbl WHERE pk > $after ORDER BY pk LIMIT N`.
// Unlike `exportTablePage` (offset-based), this scans only `limit` rows regardless of how
// far into the table we are — Postgres never has to seek-and-discard from the start.
// Used by the BULK_COPY_VIA_HTTP worker handler for big tables (>=500k rows) where the
// offset path's quadratic cost hits Supabase's statement_timeout.
async function exportTableKeyset(
  supabase: any, tableName: string, pkColumn: string,
  afterValue: unknown, limit: number, errors: string[]
): Promise<{ rows: any[], status: string, error?: string, last_pk?: unknown, has_more?: boolean }> {
  try {
    let query = supabase.from(tableName).select('*').order(pkColumn, { ascending: true }).limit(limit)
    // First page: afterValue is null/undefined, no .gt() filter.
    if (afterValue !== null && afterValue !== undefined && afterValue !== '') {
      query = query.gt(pkColumn, afterValue)
    }
    const { data, error: tableErr } = await query
    if (tableErr) {
      const msg = `table '${tableName}' keyset after=${String(afterValue)}: ${tableErr.message} (code: ${tableErr.code})`
      console.error(`[export] FAILED ${msg}`)
      errors.push(msg)
      return { rows: [], status: 'error', error: tableErr.message }
    }
    const rows = data || []
    const lastRow = rows.length > 0 ? rows[rows.length - 1] : null
    const last_pk = lastRow ? lastRow[pkColumn] : null
    // has_more is best-effort: a full page very likely means more rows. The worker treats
    // an empty next-page response as the canonical terminator either way.
    const has_more = rows.length === limit
    return { rows, status: 'ok', last_pk, has_more }
  } catch (e) {
    const msg = `table '${tableName}' keyset after=${String(afterValue)} threw: ${String(e)}`
    console.error(`[export] ${msg}`)
    errors.push(msg)
    return { rows: [], status: 'error', error: String(e) }
  }
}

Deno.serve(async (req: Request) => {
  // Validate secret
  if (req.headers.get('x-staticbot-secret') !== EXPORT_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') || 'full'
  console.log(`[export] Request: ${req.method} mode=${mode} url=${url.pathname}${url.search}`)

  // --- MODE: ping — lightweight health check for validation ---
  if (mode === 'ping') {
    console.log('[export] Ping health check — returning ok')
    return Response.json({ status: 'ok' })
  }

  // --- MODE: list — return metadata only (table names, auth users, FK info) ---
  if (mode === 'list') {
    const errors: string[] = []
    try {
      const { tableNames, tableSource } = await discoverTables(supabaseUrl, serviceRoleKey, errors)
      const allUsers = await exportAuthUsers(supabase, errors)
      const { authFkColumns, fkDiscoveryError } = await discoverFkColumns(errors)
      const tableDependencies = await discoverTableDependencies(errors)
      const tablePks = await discoverTablePks(errors)
      const rowCounts = await discoverTableRowCounts(errors)

      return Response.json({
        table_names: tableNames,
        table_pks: tablePks,
        row_counts: rowCounts,
        auth_users: allUsers,
        auth_fk_columns: authFkColumns,
        fk_discovery_error: fkDiscoveryError,
        table_dependencies: tableDependencies,
        errors,
        source: tableSource
      })
    } catch (err) {
      console.error(`[export] Top-level exception: ${String(err)}`)
      return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // --- MODE: table — return data for a single table ---
  //
  // Two call shapes:
  //   ?mode=table&name=X                      — legacy, returns ALL rows in one response
  //                                             (kept for backward compat with old workers; can
  //                                             OOM/timeout on big tables)
  //   ?mode=table&name=X&offset=N&limit=M&pk=col
  //                                           — paginated, returns one page of M rows starting at
  //                                             offset N, ordered by `pk` for deterministic
  //                                             pagination. Response carries `has_more` so the
  //                                             worker knows when to stop looping.
  if (mode === 'table') {
    const tableName = url.searchParams.get('name')
    if (!tableName) {
      return new Response(JSON.stringify({ error: 'Missing "name" query parameter' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const errors: string[] = []
    const limitParam = url.searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : 0
    try {
      if (limit > 0) {
        const offset = parseInt(url.searchParams.get('offset') || '0', 10)
        const pkColumn = url.searchParams.get('pk') || null
        const page = await exportTablePage(supabase, tableName, pkColumn, offset, limit, errors)
        return Response.json({
          table: tableName,
          rows: page.rows,
          row_count: page.rows.length,
          status: page.status,
          error: page.error,
          offset,
          limit,
          has_more: page.status === 'ok' && page.rows.length === limit,
          errors
        })
      }
      // Legacy non-paginated path
      const result = await exportTableData(supabase, tableName, errors)
      return Response.json({
        table: tableName,
        rows: result.rows,
        row_count: result.row_count,
        status: result.status,
        error: result.error,
        errors
      })
    } catch (err) {
      console.error(`[export] Top-level exception: ${String(err)}`)
      return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // --- MODE: table_keyset — single-table keyset-paginated export ---
  //
  //   ?mode=table_keyset&name=X&pk=col&after=Z&limit=N
  //                                           — returns up to N rows where pk > Z, ordered by pk.
  //                                             Omit `after` for the first page. Response carries
  //                                             `last_pk` (PK value of the last row in the page)
  //                                             and `has_more` (true when rows.length === limit).
  //
  // Designed for BULK_COPY_VIA_HTTP on big tables. Keyset pagination scans only `limit` rows
  // regardless of position, so Supabase's statement_timeout (~8s) is never approached even at
  // millions of rows deep — unlike `mode=table` (offset-based) which degraded catastrophically
  // on Heallexa's providers table (timeout at row 815k after 29 min).
  if (mode === 'table_keyset') {
    const tableName = url.searchParams.get('name')
    const pkColumn = url.searchParams.get('pk')
    if (!tableName) {
      return new Response(JSON.stringify({ error: 'Missing "name" query parameter' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    if (!pkColumn) {
      return new Response(JSON.stringify({ error: 'Missing "pk" query parameter (single-column PK required)' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const limitParam = url.searchParams.get('limit') || '5000'
    const limit = parseInt(limitParam, 10)
    if (!Number.isFinite(limit) || limit <= 0 || limit > 50000) {
      return new Response(JSON.stringify({ error: 'Invalid "limit" — must be 1..50000' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const afterRaw = url.searchParams.get('after')
    // Numeric PKs come over the wire as strings; pass straight through and let Postgres coerce
    // via the supabase-js .gt() operator. JSON-encoded values (e.g. UUIDs) work as-is.
    const afterValue = afterRaw === null || afterRaw === '' ? null : afterRaw
    const errors: string[] = []
    try {
      const page = await exportTableKeyset(supabase, tableName, pkColumn, afterValue, limit, errors)
      return Response.json({
        table: tableName,
        rows: page.rows,
        row_count: page.rows.length,
        status: page.status,
        error: page.error,
        last_pk: page.last_pk,
        has_more: page.has_more,
        errors
      })
    } catch (err) {
      console.error(`[export] Top-level exception: ${String(err)}`)
      return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // --- MODE: storage — export everything to Supabase Storage, return download URL ---
  if (mode === 'storage') {
    const errors: string[] = []
    try {
      const { tableNames, tableSource } = await discoverTables(supabaseUrl, serviceRoleKey, errors)

      const exportData: Record<string, unknown[]> = {}
      const tableResults: Record<string, { status: string, row_count: number, error?: string }> = {}
      for (const tableName of tableNames) {
        const result = await exportTableData(supabase, tableName, errors)
        exportData[tableName] = result.rows
        tableResults[tableName] = { status: result.status, row_count: result.row_count, error: result.error }
      }

      const allUsers = await exportAuthUsers(supabase, errors)
      const { authFkColumns, fkDiscoveryError } = await discoverFkColumns(errors)
      const tableDependencies = await discoverTableDependencies(errors)

      const fullPayload = {
        tables: exportData,
        auth_users: allUsers,
        auth_fk_columns: authFkColumns,
        fk_discovery_error: fkDiscoveryError,
        table_dependencies: tableDependencies,
        table_results: tableResults,
        errors,
        source: tableSource
      }

      const jsonBytes = new TextEncoder().encode(JSON.stringify(fullPayload))
      const bucketName = 'staticbot-export'
      const filePath = `export-${Date.now()}.json`

      // Ensure bucket exists (ignore error if it already does)
      await supabase.storage.createBucket(bucketName, { public: false })

      const { error: uploadErr } = await supabase.storage.from(bucketName).upload(filePath, jsonBytes, {
        contentType: 'application/json',
        upsert: true
      })
      if (uploadErr) {
        console.error(`[export] Storage upload failed: ${uploadErr.message}`)
        return new Response(JSON.stringify({ error: `Storage upload failed: ${uploadErr.message}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }

      const { data: signedData, error: signErr } = await supabase.storage.from(bucketName).createSignedUrl(filePath, 3600)
      if (signErr || !signedData?.signedUrl) {
        console.error(`[export] Signed URL creation failed: ${signErr?.message}`)
        return new Response(JSON.stringify({ error: `Signed URL creation failed: ${signErr?.message}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }

      console.log(`[export] Storage export complete: ${(jsonBytes.length / 1024).toFixed(1)} KB, ${tableNames.length} tables`)
      return Response.json({
        download_url: signedData.signedUrl,
        bucket: bucketName,
        path: filePath,
        size_bytes: jsonBytes.length,
        table_count: tableNames.length,
        table_results: tableResults,
        auth_user_count: allUsers.length,
        errors
      })
    } catch (err) {
      console.error(`[export] Top-level exception: ${String(err)}`)
      return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // --- MODE: list_storage — list all buckets + objects with signed download URLs ---
  if (mode === 'list_storage') {
    try {
      const { data: allBuckets, error: listBucketsErr } = await supabase.storage.listBuckets()
      if (listBucketsErr) {
        return new Response(JSON.stringify({ error: `Failed to list buckets: ${listBucketsErr.message}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }

      const buckets = (allBuckets || []).filter((b: any) => b.id !== 'staticbot-export')

      async function listAllObjects(bucketId: string, prefix: string = ''): Promise<any[]> {
        const { data: items, error: listErr } = await supabase.storage.from(bucketId).list(prefix, { limit: 1000 })
        if (listErr || !items) return []
        const results: any[] = []
        for (const item of items) {
          const fullPath = prefix ? `${prefix}/${item.name}` : item.name
          if (item.id) {
            // It's a file (has an id)
            results.push({ name: fullPath, size: item.metadata?.size || 0, mimetype: item.metadata?.mimetype || 'application/octet-stream' })
          } else {
            // It's a folder — recurse
            const nested = await listAllObjects(bucketId, fullPath)
            results.push(...nested)
          }
        }
        return results
      }

      const objects: Record<string, any[]> = {}
      for (const bucket of buckets) {
        const items = await listAllObjects(bucket.id)
        // Return metadata only — signed URLs are generated on demand via mode=sign_urls
        objects[bucket.id] = items
      }

      const totalObjects = Object.values(objects).reduce((sum, arr) => sum + arr.length, 0)
      console.log(`[export] list_storage complete: ${buckets.length} buckets, ${totalObjects} objects`)
      return Response.json({
        buckets: buckets.map((b: any) => ({ id: b.id, name: b.name, public: b.public, file_size_limit: b.file_size_limit || null, allowed_mime_types: b.allowed_mime_types || null })),
        objects
      })
    } catch (err) {
      console.error(`[export] list_storage exception: ${String(err)}`)
      return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // --- MODE: sign_urls — generate signed download URLs for a batch of objects ---
  if (mode === 'sign_urls') {
    const bucket = url.searchParams.get('bucket')
    if (!bucket) {
      return new Response(JSON.stringify({ error: 'Missing "bucket" query parameter' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    try {
      const paths: string[] = await req.json()
      const urls: Record<string, string | null> = {}
      for (const path of paths) {
        const { data, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
        urls[path] = (!signErr && data?.signedUrl) ? data.signedUrl : null
        if (signErr) {
          console.error(`[export] Failed to sign ${bucket}/${path}: ${signErr.message}`)
        }
      }
      return Response.json({ urls })
    } catch (err) {
      console.error(`[export] sign_urls exception: ${String(err)}`)
      return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // --- MODE: source_schema — return column definitions from information_schema ---
  if (mode === 'source_schema') {
    const errors: string[] = []
    try {
      const columns = await runSql<{
        table_name: string, column_name: string, data_type: string,
        udt_name: string, is_nullable: string, column_default: string | null,
        is_generated: string, identity_generation: string | null
      }>(
        `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default,
                is_generated, identity_generation
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY table_name, ordinal_position`,
        errors
      )
      return Response.json({ columns: columns || [], errors })
    } catch (err) {
      console.error(`[export] source_schema exception: ${String(err)}`)
      return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // --- MODE: list_secrets — read vault secrets + env vars ---
  if (mode === 'list_secrets') {
    const errors: string[] = []
    try {
      const secrets: Record<string, string> = {}
      let vaultCount = 0
      let envCount = 0

      // Read vault secrets via direct SQL
      const vaultRows = await runSql<{ name: string, decrypted_secret: string }>(
        "SELECT name, decrypted_secret FROM vault.decrypted_secrets",
        errors
      )
      if (vaultRows) {
        for (const row of vaultRows) {
          if (row.name && row.decrypted_secret) {
            secrets[row.name] = row.decrypted_secret
            vaultCount++
          }
        }
      }

      // Read env vars by name (passed via ?names= query param)
      const namesParam = url.searchParams.get('names') || ''
      const BUILTIN_VARS = new Set([
        'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL'
      ])
      if (namesParam) {
        const envNames = namesParam.split(',').filter((n: string) => n && !BUILTIN_VARS.has(n))
        for (const envName of envNames) {
          try {
            const val = Deno.env.get(envName)
            if (val && !secrets[envName]) {
              secrets[envName] = val
              envCount++
            }
          } catch (_) {
            // Env var not accessible
          }
        }
      }

      // Filter out built-in Supabase vars from vault results too
      for (const key of Object.keys(secrets)) {
        if (BUILTIN_VARS.has(key)) {
          delete secrets[key]
          vaultCount--
        }
      }

      console.log(`[export] list_secrets complete: ${vaultCount} vault, ${envCount} env`)
      return Response.json({ secrets, vault_count: vaultCount, env_count: envCount, errors })
    } catch (err) {
      console.error(`[export] list_secrets exception: ${String(err)}`)
      return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // --- MODE: list_cron — list pg_cron scheduled jobs ---
  if (mode === 'list_cron') {
    const errors: string[] = []
    try {
      // Check if pg_cron extension is installed
      const extCheck = await runSql<{ extname: string }>(
        "SELECT extname FROM pg_extension WHERE extname = 'pg_cron'",
        errors
      )
      const pgCronInstalled = extCheck !== null && extCheck.length > 0

      if (!pgCronInstalled) {
        console.log('[export] list_cron: pg_cron not installed')
        return Response.json({ cron_jobs: [], pg_cron_installed: false, errors })
      }

      const cronJobs = await runSql<{ jobid: string, schedule: string, command: string, database: string, username: string, active: boolean }>(
        "SELECT jobid::text, schedule, command, database, username, active FROM cron.job",
        errors
      )

      const jobs = cronJobs || []
      console.log(`[export] list_cron complete: ${jobs.length} cron jobs`)
      return Response.json({ cron_jobs: jobs, pg_cron_installed: true, errors })
    } catch (err) {
      console.error(`[export] list_cron exception: ${String(err)}`)
      return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // --- MODE: list_mfa — count MFA factors so the closing phase can warn the user ---
  // We don't export factor rows: TOTP secrets are encrypted with a per-project GoTrue key
  // that isn't readable via SQL or Management API, so copying the rows would leave users
  // "enrolled" with un-validatable factors. Counts only, status broken out for the notice.
  if (mode === 'list_mfa') {
    const errors: string[] = []
    try {
      const rows = await runSql<{ status: string, factor_type: string, factor_count: string }>(
        `SELECT status::text AS status, factor_type::text AS factor_type, COUNT(*)::text AS factor_count
         FROM auth.mfa_factors
         GROUP BY status, factor_type`,
        errors
      )
      if (!rows) {
        console.log('[export] list_mfa: could not query auth.mfa_factors')
        return Response.json({ mfa_factor_count: 0, verified: 0, unverified: 0, by_factor_type: {}, errors })
      }
      let total = 0
      let verified = 0
      let unverified = 0
      const byFactorType: Record<string, number> = {}
      for (const row of rows as any[]) {
        const n = parseInt(row.factor_count ?? '0', 10) || 0
        total += n
        if (row.status === 'verified') verified += n
        else unverified += n
        byFactorType[row.factor_type] = (byFactorType[row.factor_type] || 0) + n
      }
      console.log(`[export] list_mfa complete: total=${total} verified=${verified} unverified=${unverified}`)
      return Response.json({ mfa_factor_count: total, verified, unverified, by_factor_type: byFactorType, errors })
    } catch (err) {
      console.error(`[export] list_mfa exception: ${String(err)}`)
      return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // --- MODE: list_identities — export auth.identities rows for OAuth migration ---
  if (mode === 'list_identities') {
    const errors: string[] = []
    try {
      const identities = await runSql<{
        id: string, user_id: string, identity_data: string,
        provider: string, provider_id: string,
        created_at: string, last_sign_in_at: string, updated_at: string
      }>(
        `SELECT id::text, user_id::text, identity_data::text, provider, provider_id,
                created_at::text, last_sign_in_at::text, updated_at::text
         FROM auth.identities`,
        errors
      )

      if (!identities) {
        console.log('[export] list_identities: could not query auth.identities')
        return Response.json({ identities: [], error: 'SQL query failed', errors })
      }

      // Parse identity_data from text back to object
      const parsed = (identities as any[]).map((row: any) => ({
        ...row,
        identity_data: typeof row.identity_data === 'string' ? JSON.parse(row.identity_data) : row.identity_data
      }))

      console.log(`[export] list_identities complete: ${parsed.length} identities`)
      return Response.json({ identities: parsed, errors })
    } catch (err) {
      console.error(`[export] list_identities exception: ${String(err)}`)
      return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // --- MODE: full (default) — original behavior, return everything in response ---
  const errors: string[] = []
  try {
    const { tableNames, tableSource } = await discoverTables(supabaseUrl, serviceRoleKey, errors)

    const exportData: Record<string, unknown[]> = {}
    const tableResults: Record<string, { status: string, row_count: number, error?: string }> = {}
    for (const tableName of tableNames) {
      const result = await exportTableData(supabase, tableName, errors)
      exportData[tableName] = result.rows
      tableResults[tableName] = { status: result.status, row_count: result.row_count, error: result.error }
    }

    const allUsers = await exportAuthUsers(supabase, errors)
    const { authFkColumns, fkDiscoveryError } = await discoverFkColumns(errors)
    const tableDependencies = await discoverTableDependencies(errors)

    console.log(`[export] Completed (source: ${tableSource}). ${errors.length} error(s)`)
    return Response.json({
      tables: exportData,
      auth_users: allUsers,
      auth_fk_columns: authFkColumns,
      fk_discovery_error: fkDiscoveryError,
      table_dependencies: tableDependencies,
      table_results: tableResults,
      errors,
      source: tableSource
    })
  } catch (err) {
    console.error(`[export] Top-level exception: ${String(err)}`)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
