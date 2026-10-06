import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {readableReasoning, roundTraces, type ModelTrace} from "../lib/replay-traces.ts";

test("trace selection separates rounds, players and preserves retries and full reasoning", () => {
  const text = "reasoning ".repeat(2000);
  const calls = [
    {call_index:1, round:1, player_id:"p0", reasoning:text, reasoning_details:[{type:"reasoning.text",text}]},
    {call_index:2, round:1, player_id:"p0", reasoning:null, reasoning_details:[]},
    {call_index:3, round:2, player_id:"p0", reasoning:null, reasoning_details:[]},
    {call_index:4, round:1, player_id:"p1", reasoning:null, reasoning_details:[]},
  ] as ModelTrace[];
  assert.deepEqual(roundTraces(calls,1,"p0").map(c=>c.call_index),[1,2]);
  assert.deepEqual(readableReasoning(calls[0]),[text]);
  assert.deepEqual(readableReasoning(calls[1]),[]);
});

test("published research replays retain every provider attempt without ciphertext", () => {
  const paths = fs.readdirSync("public/data/traces");
  assert.equal(paths.length,489);
  let reasoning = 0;
  const allCompact = JSON.parse(fs.readFileSync("public/data/research-provider-calls.json","utf8"));
  for (const file of paths) {
    const data = JSON.parse(fs.readFileSync(`public/data/traces/${file}`,"utf8"));
    assert.equal(data.game_id, file.replace(".json",""));
    const compact = allCompact[data.game_id];
    assert.equal(data.calls.length,compact.length);
    for (const call of data.calls as ModelTrace[]) {
      assert.ok(!JSON.stringify(call).includes('"data":'));
      if (readableReasoning(call).length) reasoning++;
    }
  }
  assert.ok(reasoning>0);
});
