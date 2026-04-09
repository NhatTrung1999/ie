export type ExportTableCtDto = {
  stage?: string;
  stageItemId?: string;
  rowIds?: string[];
  estimateOutputPairs?: number;
  workingTimeSeconds?: number;
  taktTimeSeconds?: number;
  manpowerStandardLabor?: number;
  capacityPerHour?: number;
  totalCtSeconds?: number;
};
