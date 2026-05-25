import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowCompiler } from "../src/workflows/compiler";
import { WorkflowExecutor } from "../src/workflows/executor";

test("command step: echo json passes json_path gate and hoists keys onto data", async () => {
  const compiler = new WorkflowCompiler();
  const workflow: any = {
    id: "wf-cmd-echo",
    target: "noop",
    mode: "automatic",
    steps: [
      {
        id: "echo",
        command: ["node", "-e", "console.log(JSON.stringify({ ok: true, response_text: 'OK', completion_detected: true, conversation_id: 'abc-123' }))"],
        gate: {
          exit_code: 0,
          json_path: [
            { path: "ok", equals: true },
            { path: "response_text", nonempty: true },
            { path: "completion_detected", equals: true }
          ]
        }
      }
    ]
  };
  const plan = compiler.compile(workflow);
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].command?.argv?.[0], "node");
  assert.equal(plan.actions[0].requiresApproval, false, "automatic mode auto-approves command steps");

  const executor = new WorkflowExecutor();
  const result = await executor.run(workflow);
  assert.equal(result.ok, true, `expected ok=true, got results=${JSON.stringify(result.results)}`);
  const row = result.results[0] as any;
  assert.equal(row.ok, true);
  assert.equal(row.data.exit_code, 0);
  assert.equal(row.data.response_text, "OK", "hoisted response_text from stdout JSON");
  assert.equal(row.data.completion_detected, true, "hoisted completion_detected from stdout JSON");
  assert.equal(row.data.conversation_id, "abc-123", "hoisted conversation_id from stdout JSON");
  assert.equal((row.data.gate.json_path[0] as any).ok, true);
});

test("command step: failing json_path produces ok=false with COMMAND_GATE_FAILED", async () => {
  const workflow: any = {
    id: "wf-cmd-fail",
    target: "noop",
    mode: "automatic",
    steps: [
      {
        id: "echo",
        command: ["node", "-e", "console.log(JSON.stringify({ ok: false, errorCode: 'NOPE' }))"],
        gate: { exit_code: 0, json_path: [{ path: "ok", equals: true }] }
      }
    ]
  };
  const executor = new WorkflowExecutor();
  const result = await executor.run(workflow);
  assert.equal(result.ok, false);
  const row = result.results[0] as any;
  assert.equal(row.ok, false);
  assert.equal(row.data.errorCode, "NOPE", "preserves errorCode from CLI stdout when gate fails");
});

test("command step: non-automatic mode requires approval and short-circuits with APPROVAL_REQUIRED", async () => {
  const workflow: any = {
    id: "wf-cmd-approval",
    target: "noop",
    // default mode: no automatic → command step must request approval
    steps: [
      {
        id: "echo",
        command: ["node", "-e", "console.log('{}')"]
      }
    ]
  };
  const executor = new WorkflowExecutor();
  const result = await executor.run(workflow);
  assert.equal(result.ok, false);
  const row = result.results[0] as any;
  assert.equal(row.ok, false);
  assert.equal(row.data.errorCode, "APPROVAL_REQUIRED");
});

test("command step: stdout_regex and exit_code gates work together", async () => {
  const workflow: any = {
    id: "wf-cmd-regex",
    target: "noop",
    mode: "automatic",
    steps: [
      {
        id: "echo",
        command: ["node", "-e", "console.log('hello world from cli'); process.exit(0)"],
        gate: { exit_code: 0, stdout_regex: "hello\\s+world" }
      }
    ]
  };
  const executor = new WorkflowExecutor();
  const result = await executor.run(workflow);
  assert.equal(result.ok, true, `expected ok=true, results=${JSON.stringify(result.results)}`);
});
