export type CreateHistoryDto = {
  stageCode: string;
  startTime: number;
  endTime: number;
  type: 'NVA' | 'VA' | 'SKIP';
  value: number;
};
