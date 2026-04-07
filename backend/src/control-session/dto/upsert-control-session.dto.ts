export type UpsertControlSessionDto = {
  stageCode: string;
  elapsed: number;
  isRunning: boolean;
  segmentStart: number;
  nva?: number | null;
  va?: number | null;
  skip?: number | null;
};
