import type {
  CtRow,
  HistoryItem,
  StageItem,
  StageKey,
} from '@/types/dashboard';

export const stages: StageKey[] = ['CUTTING', 'STITCHING', 'ASSEMBLY', 'STOCK'];

export const stageItems: StageItem[] = [
  {
    id: 'c10',
    code: 'C10',
    name: 'Tears.mp4',
    duration: '03:44',
    mood: 'NVA',
    stage: 'CUTTING',
  },
  {
    id: 'c4',
    code: 'C4',
    name: 'Your Love.mp4',
    duration: '05:34',
    mood: 'VA',
    stage: 'CUTTING',
  },
  {
    id: 'c3',
    code: 'C3',
    name: 'Hugs & Kisses.mp4',
    duration: '03:12',
    mood: 'NVA',
    stage: 'CUTTING',
  },
  {
    id: 'c2',
    code: 'C2',
    name: 'You & Me.mp4',
    duration: '04:59',
    mood: 'NVA',
    stage: 'CUTTING',
  },
  {
    id: 's1',
    code: 'S1',
    name: 'Transition Pack.mp4',
    duration: '02:40',
    mood: 'VA',
    stage: 'STITCHING',
  },
  {
    id: 'a1',
    code: 'A1',
    name: 'Album Intro.mov',
    duration: '01:45',
    mood: 'VA',
    stage: 'ASSEMBLY',
  },
  {
    id: 'st1',
    code: 'ST1',
    name: 'Archive 2401.zip',
    duration: '00:30',
    mood: 'NVA',
    stage: 'STOCK',
  },
];

export const historyItems: HistoryItem[] = [
  { id: 'h1', range: '00:09 - 00:13', label: 'SKIP: 3.44', committed: false },
  { id: 'h2', range: '00:04 - 00:09', label: 'VA: 5.34', committed: false },
  { id: 'h3', range: '00:00 - 00:04', label: 'NVA: 4.59', committed: false },
  { id: 'h3', range: '00:00 - 00:04', label: 'NVA: 4.59', committed: false },
  { id: 'h3', range: '00:00 - 00:04', label: 'NVA: 4.59', committed: false },
  { id: 'h3', range: '00:00 - 00:04', label: 'NVA: 4.59', committed: false },
  { id: 'h3', range: '00:00 - 00:04', label: 'NVA: 4.59', committed: false },
  { id: 'h3', range: '00:00 - 00:04', label: 'NVA: 4.59', committed: false },
];

export const ctRows: CtRow[] = [
  {
    id: 'r1',
    no: 'C4',
    partName: 'Your Love',
    nvaValues: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    vaValues: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    machineType: 'Select..',
    confirmed: false,
    done: false,
  },
  {
    id: 'r2',
    no: 'C3',
    partName: 'Hugs & Kisses',
    nvaValues: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    vaValues: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    machineType: 'Select..',
    confirmed: false,
    done: false,
  },
  {
    id: 'r3',
    no: 'C2',
    partName: 'You & Me',
    nvaValues: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    vaValues: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    machineType: 'Select..',
    confirmed: true,
    done: false,
  },
];
