import {
  fetchReduceTerminalsTrace,
  fetchReduceRedundantTrace,
  fetchReduceMergeTrace
} from "../../net/api.js";
import { playReduceTerminalsTrace } from "./step_1_reduce_terminals.js";
import { playReduceRedundantTrace } from "./step_2_reduce_redundant_tests.js";
import { playReduceMergeTrace } from "./step_3_reduce_non_terminals.js";

export const REDUCE_TRACE_BY_KIND = {
  terminals: { kind: "terminals", fetchTrace: fetchReduceTerminalsTrace, playTrace: playReduceTerminalsTrace },
  redundant: { kind: "redundant", fetchTrace: fetchReduceRedundantTrace, playTrace: playReduceRedundantTrace },
  merge: { kind: "merge", fetchTrace: fetchReduceMergeTrace, playTrace: playReduceMergeTrace }
};
