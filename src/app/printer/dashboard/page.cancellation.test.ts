import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
// Exercise existing in-page functions without moving/refactoring production logic.
const source = ts.createSourceFile("page.tsx", readFileSync("src/app/printer/dashboard/page.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function evaluate<T>(name: string, context: Record<string, unknown>): T {
  let expression = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) expression = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!expression) throw new Error(`Missing production function ${name}`);
  const js = ts.transpileModule(`const value = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn value;`)(...Object.values(context));
}

describe("Dashboard cancellation preserves monthly snapshots", () => {
  it("undoes reconciliation then cancels Order without monthly deletion", async () => {
    const writes: Array<{table:string; operation:string; value?:unknown}> = [];
    const order: Record<string, unknown> = { id: 7, product_id: "CARD", product_name: "Test card", good_a3: 8, waste_a3: 2, qty_per_a3_used: 1, paper_type: "300 แกรม", created_by_user_id: "actor" };
    const monthly = [{ source_paper_report_id: 10, paper_used_a3: 10 }];
    let reports = [{ id: 10, order_id: 7 }];
    const rpc = vi.fn();
    const supabase = { rpc, from: (table: string) => ({
      delete: () => {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
          then: (done: (value: unknown) => void) => {
            writes.push({table,operation:"delete",value:filters});
            if (table === "paper_reports") reports = [];
            done({ error: null });
          },
        }; return chain;
      },
      update: (value: Record<string, unknown>) => ({ eq: async () => { writes.push({table,operation:"update",value}); Object.assign(order,value); return {error:null}; } }),
    }) };
    const context = { isAdmin: true, currentUserId: "actor", productMetaMap: { CARD: { qtyPerA3: 1 } }, supabase,
      AppSwal: { fire: vi.fn().mockResolvedValue({isConfirmed:true,value:"test reason"}) },
      setOrders: vi.fn(), hasStockReconciliation: (o: Record<string,unknown>) => o.good_a3 != null,
      getCurrentUserIdentifier: () => "test actor", setStockDetailOrder: vi.fn(),
    };
    await evaluate<(o: unknown)=>Promise<void>>("undoReconcile",context)(order);
    await evaluate<(o: unknown)=>Promise<void>>("handleCancelOrder",context)(order);
    expect(rpc).not.toHaveBeenCalled();
    expect(writes.map(w=>[w.table,w.operation])).toEqual([["paper_transactions","delete"],["paper_reports","delete"],["orders","update"],["orders","update"]]);
    expect(writes[0].value).toEqual({reference_id:7,transaction_type:"OUT"});
    expect(order.is_cancelled).toBe(true); expect(order.good_a3).toBeNull(); expect(reports).toEqual([]);
    expect(monthly).toEqual([{source_paper_report_id:10,paper_used_a3:10}]);
  });
  it("retains the existing requirement to undo stock reconciliation first", async () => {
    const fire=vi.fn(); const from=vi.fn();
    const cancel=evaluate<(o:unknown)=>Promise<void>>("handleCancelOrder",{isAdmin:true,currentUserId:"actor",hasStockReconciliation:()=>true,AppSwal:{fire},supabase:{from}});
    await cancel({id:1}); expect(from).not.toHaveBeenCalled();
    expect(fire).toHaveBeenCalledWith(expect.objectContaining({title:"ยังยกเลิกคำสั่งไม่ได้"}));
  });
});
