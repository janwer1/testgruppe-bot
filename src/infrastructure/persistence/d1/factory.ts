// biome-ignore-all lint/suspicious/noExplicitAny: Internal factory with dynamic types for zero-migration document store

import { type Type, type } from "arktype";
import { and, eq, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import superjson from "superjson";
import { ulid } from "ulid";

type SQLiteDB = DrizzleD1Database<any> | BunSQLiteDatabase<any>;

export function arktypeJsonTable<T extends Type<any>>(
  _typeName: string,
  schema: T,
  tableName: string,
  db: SQLiteDB,
  _indexFields: string[] = [],
) {
  type DataType = T["infer"];

  const rawTable = sqliteTable(tableName, {
    id: text("id").primaryKey(),
    data: text("data").notNull(),
  });

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

  const deserialize = (row: any): any => {
    if (!row) return null;
    // Handle JOINed results: { tableA: { id, data }, tableB: { id, data } }
    if (typeof row === "object" && !row.data && row.constructor === Object) {
      const out: any = {};
      for (const [k, v] of Object.entries(row)) {
        if (v && typeof v === "object" && (v as any).data) {
          const base = superjson.parse<any>((v as any).data);
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

  function isPlainObject(obj: any) {
    return obj && typeof obj === "object" && obj.constructor === Object && !obj._isSql && !obj.params;
  }

  function wrapQuery(query: any) {
    const originalWhere = query.where.bind(query);
    const originalAll = query.all.bind(query);
    const originalGet = query.get.bind(query);

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

    insert: async (values: DataType | DataType[]): Promise<any> => {
      const arr = Array.isArray(values) ? values : [values];
      const resultItems: any[] = [];
      const rows = arr.map((v) => {
        const out = schema(v);
        if (out instanceof type.errors) throw new Error(`Validation Error: ${out.summary}`);
        const id = (v as any).id || ulid();
        resultItems.push({ id, ...v });
        return { id, data: superjson.stringify(v) };
      });
      if (rows.length === 0) return [];
      await db.insert(rawTable).values(rows).run();
      return Array.isArray(values) ? resultItems : resultItems[0];
    },

    upsert: async (value: DataType, explicitId?: string): Promise<any> => {
      const out = schema(value);
      if (out instanceof type.errors) throw new Error(`Validation Error: ${out.summary}`);

      const id = explicitId || (value as any).id;
      if (!id) throw new Error("Upsert requires ID (either in object or explicit)");

      const row = { id, data: superjson.stringify(value) };

      await db
        .insert(rawTable)
        .values(row)
        .onConflictDoUpdate({ target: rawTable.id, set: { data: row.data } })
        .run();

      return value;
    },

    select: (selection?: Record<string, boolean>) => {
      let selectMap: any = { id: rawTable.id, data: rawTable.data };
      if (selection) {
        selectMap = { id: rawTable.id };
        Object.entries(selection).forEach(([k, v]) => {
          if (v) selectMap[k] = proxy[k];
        });
      }
      return wrapQuery((db as any).select(selectMap).from(rawTable));
    },

    findById: (id: string) => wrapQuery(db.select().from(rawTable)).where({ id }).get(),
    findByField: (field: string, value: any) =>
      wrapQuery(db.select().from(rawTable))
        .where({ [field]: value })
        .all(),

    query: () => wrapQuery(db.select().from(rawTable)),
  };
}
