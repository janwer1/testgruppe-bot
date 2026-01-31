import { type Type, type } from "arktype";
import { and, eq, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import superjson from "superjson";
import { ulid } from "ulid";

// biome-ignore lint/suspicious/noExplicitAny: Generic database type
type SQLiteDB = DrizzleD1Database<any> | BunSQLiteDatabase<any>;

// biome-ignore lint/suspicious/noExplicitAny: Generic arktype schema
export function arktypeJsonTable<T extends Type<any>>(
  _typeName: string,
  schema: T,
  tableName: string,
  db: SQLiteDB,
  indexFields: string[] = [],
) {
  type DataType = T["infer"];

  const rawTable = sqliteTable(tableName, {
    id: text("id").primaryKey(),
    data: text("data").notNull(),
  });

  // biome-ignore lint/suspicious/noExplicitAny: Proxy intercepts all field access
  const proxy: any = new Proxy(
    {},
    {
      get: (_, prop) => {
        if (prop === "id") return rawTable.id;
        if (prop === "_raw") return rawTable.data;
        if (prop === "_rawTable") return rawTable;

        // Strictly block all non-string or internal keys
        if (
          typeof prop !== "string" ||
          prop.startsWith("_") ||
          prop === "then" ||
          prop === "constructor" ||
          prop === "toJSON" ||
          prop === "toString" ||
          prop === "decoder" ||
          prop === "shouldInlineParams" ||
          prop === "usedTables" ||
          prop === "queryChunks"
        ) {
          return undefined;
        }
        return sql`json_extract(${rawTable.data}, ${sql.raw(`'$.json.${prop}'`)})`;
      },
    },
  );

  // biome-ignore lint/suspicious/noExplicitAny: Dynamic deserialization
  const deserialize = (row: any): any => {
    if (!row) return null;
    // Handle JOINed results: { tableA: { id, data }, tableB: { id, data } }
    if (typeof row === "object" && !row.data && row.constructor === Object) {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic output mapping
      const out: any = {};
      for (const [k, v] of Object.entries(row)) {
        // biome-ignore lint/suspicious/noExplicitAny: superjson parse result
        if (v && typeof v === "object" && (v as any).data) {
          // biome-ignore lint/suspicious/noExplicitAny: superjson parse result
          const base = superjson.parse<any>((v as any).data);
          // biome-ignore lint/suspicious/noExplicitAny: optional ID access
          out[k] = { id: (v as any).id, ...base };
        } else {
          out[k] = v;
        }
      }
      return out;
    }
    // Handle single table results: { id, data }
    if (row && typeof row === "object" && row.data) {
      const base = superjson.parse<DataType>(row.data);
      return { id: row.id, ...base };
    }
    return row;
  };

  // biome-ignore lint/suspicious/noExplicitAny: Internal utility
  function isPlainObject(obj: any) {
    return obj && typeof obj === "object" && obj.constructor === Object && !obj._isSql && !obj.params;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Wrapper for drizzle query
  function wrapQuery(query: any) {
    const originalWhere = query.where.bind(query);
    const originalAll = query.all.bind(query);
    const originalGet = query.get.bind(query);

    // biome-ignore lint/suspicious/noExplicitAny: Intercepts drizzle conditions
    query.where = (condition: any) => {
      if (isPlainObject(condition)) {
        const clauses = Object.entries(condition).map(([k, v]) => {
          const column = proxy[k];
          return eq(column, v);
        });
        const finalCondition = clauses.length > 1 ? and(...clauses) : clauses[0];
        return wrapQuery(originalWhere(finalCondition));
      }
      return wrapQuery(originalWhere(condition));
    };

    query.all = async () => (await originalAll()).map(deserialize);
    query.get = async () => deserialize(await originalGet());

    return query;
  }

  return {
    table: rawTable,
    proxy,
    tableName,

    initialize: async () => {
      // D1 doesn't support direct SQL run efficiently like this, best to use migrations
      // But for dev/init we can try
      await db.run(
        sql.raw(`
                CREATE TABLE IF NOT EXISTS ${tableName} (
                  id TEXT PRIMARY KEY,
                  data TEXT NOT NULL
                )
            `),
      );

      for (const key of indexFields) {
        await db.run(
          sql.raw(`
                    CREATE INDEX IF NOT EXISTS idx_${tableName}_${key}
                    ON ${tableName}(json_extract(data, '$.json.${key}'))
                `),
        );
      }
    },

    // biome-ignore lint/suspicious/noExplicitAny: Return items include generated IDs
    insert: async (values: DataType | DataType[]): Promise<any> => {
      const arr = Array.isArray(values) ? values : [values];
      // biome-ignore lint/suspicious/noExplicitAny: Internal item tracking
      const resultItems: any[] = [];
      const rows = arr.map((v) => {
        const out = schema(v);
        if (out instanceof type.errors) throw new Error(`Validation Error: ${out.summary}`);
        // biome-ignore lint/suspicious/noExplicitAny: Optional ID check
        const id = (v as any).id || ulid();
        resultItems.push({ id, ...v });
        return { id, data: superjson.stringify(v) };
      });
      if (rows.length === 0) return [];
      await db.insert(rawTable).values(rows).run();
      return Array.isArray(values) ? resultItems : resultItems[0];
    },

    // Helper for simple updates since simple upsert isn't fully standardized in this factory
    // biome-ignore lint/suspicious/noExplicitAny: Standardized upsert return
    upsert: async (value: DataType, explicitId?: string): Promise<any> => {
      const out = schema(value);
      if (out instanceof type.errors) throw new Error(`Validation Error: ${out.summary}`);

      // biome-ignore lint/suspicious/noExplicitAny: Accessing optional field
      const id = explicitId || (value as any).id;
      if (!id) throw new Error("Upsert requires ID (either in object or explicit)");

      const row = { id, data: superjson.stringify(value) };

      // D1 SQLite upsert
      await db
        .insert(rawTable)
        .values(row)
        .onConflictDoUpdate({ target: rawTable.id, set: { data: row.data } })
        .run();

      return value;
    },

    select: (selection?: Record<string, boolean>) => {
      // biome-ignore lint/suspicious/noExplicitAny: Internal select map
      let selectMap: any = { id: rawTable.id, data: rawTable.data };
      if (selection) {
        selectMap = { id: rawTable.id };
        Object.entries(selection).forEach(([k, v]) => {
          if (v) selectMap[k] = proxy[k];
        });
      }
      // biome-ignore lint/suspicious/noExplicitAny: Selective select
      return wrapQuery((db as any).select(selectMap).from(rawTable));
    },

    findById: (id: string) => wrapQuery(db.select().from(rawTable)).where({ id }).get(),
    // biome-ignore lint/suspicious/noExplicitAny: Value can be any primitive
    findByField: (field: string, value: any) =>
      wrapQuery(db.select().from(rawTable))
        .where({ [field]: value })
        .all(),

    query: () => wrapQuery(db.select().from(rawTable)),
  };
}
