import { useState } from 'react';
import { Download, Upload, Share2, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { electronBridge } from '@/lib/electron-bridge';
import { apiClient } from '@/lib/api-client';

type ShareDataModalProps = {
  open: boolean;
  onClose: () => void;
};

type ExportState = 'idle' | 'exporting' | 'done' | 'error';
type ImportState = 'idle' | 'importing' | 'done' | 'error';

export function ShareDataModal({ open, onClose }: ShareDataModalProps) {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [importState, setImportState] = useState<ImportState>('idle');
  const [exportMessage, setExportMessage] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [previewData, setPreviewData] = useState<{
    stageCount: number;
    tableCtCount: number;
    historyCount: number;
    exportedAt: string;
    deviceIp: string;
  } | null>(null);
  const [importFilePath, setImportFilePath] = useState<string | null>(null);

  if (!open) return null;

  // ============================================================
  // EXPORT
  // ============================================================
  const handleExport = async () => {
    setExportState('exporting');
    setExportMessage('');

    try {
      // 1. Lấy tất cả data từ local backend
      const [stagesRes, tableCtRes, historyRes, identityRes] = await Promise.all([
        apiClient.get<{ stages?: any[] }>('/stages'),
        apiClient.get<{ rows?: any[] }>('/table-ct'),
        apiClient.get<{ items?: any[] }>('/history'),
        apiClient.get<{ ip: string; hostname: string }>('/identity'),
      ]);

      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        deviceIp: identityRes.data.ip,
        deviceHostname: identityRes.data.hostname,
        stages: stagesRes.data.stages ?? [],
        tableCt: tableCtRes.data.rows ?? [],
        history: historyRes.data.items ?? [],
      };

      // 2. Mở dialog lưu file
      const filePath = await electronBridge.exportData();
      if (!filePath) {
        setExportState('idle');
        return;
      }

      // 3. Ghi file
      const result = await electronBridge.writeDataFile(filePath, JSON.stringify(exportData, null, 2));

      if (result.success) {
        setExportState('done');
        setExportMessage(
          `Đã xuất ${exportData.stages.length} stages, ${exportData.tableCt.length} CT rows, ${exportData.history.length} history items`,
        );
      } else {
        throw new Error(result.error ?? 'Không thể ghi file');
      }
    } catch (error) {
      setExportState('error');
      setExportMessage(error instanceof Error ? error.message : 'Xuất dữ liệu thất bại');
    }
  };

  // ============================================================
  // IMPORT — Step 1: chọn file và preview
  // ============================================================
  const handleSelectImportFile = async () => {
    const filePath = await electronBridge.importData();
    if (!filePath) return;

    setImportFilePath(filePath);
    setImportState('idle');
    setImportMessage('');
    setPreviewData(null);

    try {
      const readResult = await electronBridge.readDataFile(filePath);
      if (!readResult.success || !readResult.data) {
        throw new Error(readResult.error ?? 'Không thể đọc file');
      }

      const parsed = JSON.parse(readResult.data) as {
        version?: string;
        exportedAt?: string;
        deviceIp?: string;
        stages?: any[];
        tableCt?: any[];
        history?: any[];
      };

      if (!parsed.version || !parsed.stages) {
        throw new Error('File không hợp lệ (thiếu dữ liệu)');
      }

      setPreviewData({
        stageCount: parsed.stages.length,
        tableCtCount: parsed.tableCt?.length ?? 0,
        historyCount: parsed.history?.length ?? 0,
        exportedAt: parsed.exportedAt ?? '',
        deviceIp: parsed.deviceIp ?? 'Unknown',
      });
    } catch (error) {
      setImportState('error');
      setImportMessage(error instanceof Error ? error.message : 'File không hợp lệ');
      setImportFilePath(null);
    }
  };

  // ============================================================
  // IMPORT — Step 2: thực sự import vào DB
  // ============================================================
  const handleConfirmImport = async () => {
    if (!importFilePath || !previewData) return;

    setImportState('importing');
    setImportMessage('');

    try {
      const readResult = await electronBridge.readDataFile(importFilePath);
      if (!readResult.success || !readResult.data) {
        throw new Error('Không thể đọc file');
      }

      const parsed = JSON.parse(readResult.data);

      // Gọi import endpoint trên local backend
      const response = await apiClient.post<{
        imported: { stages: number; tableCt: number; history: number };
      }>('/sync/import', {
        stages: parsed.stages ?? [],
        tableCt: parsed.tableCt ?? [],
        history: parsed.history ?? [],
      });

      const { stages, tableCt, history } = response.data.imported;
      setImportState('done');
      setImportMessage(`Đã nhập: ${stages} stages, ${tableCt} CT rows, ${history} history items`);
      setPreviewData(null);
      setImportFilePath(null);
    } catch (error) {
      setImportState('error');
      setImportMessage(error instanceof Error ? error.message : 'Nhập dữ liệu thất bại');
    }
  };

  const resetExport = () => {
    setExportState('idle');
    setExportMessage('');
  };

  const resetImport = () => {
    setImportState('idle');
    setImportMessage('');
    setPreviewData(null);
    setImportFilePath(null);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/25 px-3 py-6 backdrop-blur-[2px] sm:px-4 sm:py-10">
      <div className="w-full max-w-[440px] overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_20px_64px_rgba(15,23,42,0.16)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-gradient-to-b from-emerald-500 to-teal-500" />
              <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                Data Sharing
              </span>
            </div>
            <h2 className="text-[20px] font-semibold tracking-tight text-slate-700">
              Chia sẻ dữ liệu
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => setActiveTab('export')}
            className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition ${
              activeTab === 'export'
                ? 'border-b-2 border-emerald-500 text-emerald-600'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Download className="h-4 w-4" />
            Xuất dữ liệu
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition ${
              activeTab === 'import'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Upload className="h-4 w-4" />
            Nhập dữ liệu
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* ======= EXPORT TAB ======= */}
          {activeTab === 'export' && (
            <>
              <p className="text-sm text-slate-500">
                Xuất toàn bộ dữ liệu hiện tại ra file <code className="rounded bg-slate-100 px-1 text-xs">.iedata</code> để chia sẻ với máy khác.
              </p>

              {exportState === 'idle' && (
                <button
                  onClick={handleExport}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(16,185,129,0.3)] transition hover:from-emerald-600 hover:to-teal-600"
                >
                  <Share2 className="h-4 w-4" />
                  Xuất file .iedata
                </button>
              )}

              {exportState === 'exporting' && (
                <div className="flex items-center justify-center gap-3 rounded-xl bg-slate-50 py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                  <span className="text-sm text-slate-600">Đang xuất dữ liệu...</span>
                </div>
              )}

              {exportState === 'done' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3">
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    <div>
                      <p className="text-sm font-medium text-emerald-700">Xuất thành công!</p>
                      <p className="text-xs text-emerald-600">{exportMessage}</p>
                    </div>
                  </div>
                  <button
                    onClick={resetExport}
                    className="w-full rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Xuất lại
                  </button>
                </div>
              )}

              {exportState === 'error' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-xl bg-red-50 p-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                    <div>
                      <p className="text-sm font-medium text-red-700">Xuất thất bại</p>
                      <p className="text-xs text-red-600">{exportMessage}</p>
                    </div>
                  </div>
                  <button
                    onClick={resetExport}
                    className="w-full rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Thử lại
                  </button>
                </div>
              )}
            </>
          )}

          {/* ======= IMPORT TAB ======= */}
          {activeTab === 'import' && (
            <>
              <p className="text-sm text-slate-500">
                Nhập dữ liệu từ file <code className="rounded bg-slate-100 px-1 text-xs">.iedata</code> của máy khác.{' '}
                <span className="font-medium text-amber-600">Dữ liệu trùng sẽ bị ghi đè.</span>
              </p>

              {importState === 'idle' && !previewData && (
                <button
                  onClick={handleSelectImportFile}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-4 text-sm font-medium text-slate-500 transition hover:border-blue-300 hover:text-blue-500"
                >
                  <Upload className="h-4 w-4" />
                  Chọn file .iedata
                </button>
              )}

              {/* Preview trước khi import */}
              {previewData && importState === 'idle' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-500">
                      Preview file
                    </p>
                    <div className="space-y-1 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span>Máy nguồn:</span>
                        <span className="font-medium">{previewData.deviceIp}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Thời gian xuất:</span>
                        <span className="font-medium">
                          {previewData.exportedAt
                            ? new Date(previewData.exportedAt).toLocaleString('vi-VN')
                            : '—'}
                        </span>
                      </div>
                      <div className="mt-1 border-t border-blue-100 pt-1">
                        <div className="flex justify-between">
                          <span>Stages:</span>
                          <span className="font-semibold text-blue-600">{previewData.stageCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>CT Rows:</span>
                          <span className="font-semibold text-blue-600">{previewData.tableCtCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>History:</span>
                          <span className="font-semibold text-blue-600">{previewData.historyCount}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={resetImport}
                      className="rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={handleConfirmImport}
                      className="rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)] transition hover:from-blue-600 hover:to-blue-700"
                    >
                      Xác nhận nhập
                    </button>
                  </div>
                </div>
              )}

              {importState === 'importing' && (
                <div className="flex items-center justify-center gap-3 rounded-xl bg-slate-50 py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  <span className="text-sm text-slate-600">Đang nhập dữ liệu...</span>
                </div>
              )}

              {importState === 'done' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3">
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    <div>
                      <p className="text-sm font-medium text-emerald-700">Nhập thành công!</p>
                      <p className="text-xs text-emerald-600">{importMessage}</p>
                    </div>
                  </div>
                  <button
                    onClick={resetImport}
                    className="w-full rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Nhập file khác
                  </button>
                </div>
              )}

              {importState === 'error' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-xl bg-red-50 p-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                    <div>
                      <p className="text-sm font-medium text-red-700">Nhập thất bại</p>
                      <p className="text-xs text-red-600">{importMessage}</p>
                    </div>
                  </div>
                  <button
                    onClick={resetImport}
                    className="w-full rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Thử lại
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
