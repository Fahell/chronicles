import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

interface TestRow {
  id: string;
  value: number;
}

describe("dexie persistence (fake-indexeddb)", () => {
  let db: Dexie;

  afterEach(() => {
    db.close();
  });

  it("round-trips a row through an index", async () => {
    db = new Dexie("rpg_test");
    db.version(1).stores({ rows: "id, value" });

    await db.table<TestRow>("rows").put({ id: "a", value: 1 });
    await db.table<TestRow>("rows").put({ id: "b", value: 2 });

    const rows = await db.table<TestRow>("rows").orderBy("value").toArray();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "a", value: 1 });
    expect(rows[1]).toMatchObject({ id: "b", value: 2 });
  });

  it("deletes a row", async () => {
    db = new Dexie("rpg_test");
    db.version(1).stores({ rows: "id" });

    await db.table<TestRow>("rows").put({ id: "a", value: 1 });
    await db.table<TestRow>("rows").delete("a");

    expect(await db.table<TestRow>("rows").get("a")).toBeUndefined();
  });
});
