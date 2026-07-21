export interface AnalyzedExpression {
  rewritten: string;
  depMask: number;
}

export interface AnalyzedScript {
  thunkCode: string;
}

export interface AnalysisResult {
  varToReg: Map<string, number>;
  nextRegIdx: number;
  scriptThunkCodes: string[];
}

export interface Replacement {
  start: number;
  end: number;
  text: string;
}
