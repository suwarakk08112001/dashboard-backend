import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';
import { SearchDto } from './dto/search-dashboard.dto';

/* ════════════════════════════════════════════════
   Types
   ════════════════════════════════════════════════ */

interface CacheEntry {
  data: string[][];
  fetchedAt: number;
}

export interface MonthlyTotal {
  month: number;
  totalIn: number;
  totalOut: number;
  medSupply: number;
}

export interface NamedTotal {
  name: string;
  total: number;
}

interface ColumnIndices {
  name: number;
  value: number;
  yearMonth: number;
}

interface FiscalContext {
  fiscalYear: number;
  targetMonth: number | null;
  startYear: number;
}

/* ════════════════════════════════════════════════
   Constants
   ════════════════════════════════════════════════ */

const COLUMN_HEADERS = {
  PRODUCT_NAME: 'ชื่อสินค้า',
  TOTAL_VALUE: 'มูลค่ารวม',
  YEAR_MONTH: 'ปีเดือน',
} as const;

const FISCAL_MONTH_ORDER = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const TOP_N = 10;
const CACHE_TTL_MS = 2 * 60 * 1000;

/* ════════════════════════════════════════════════
   Service
   ════════════════════════════════════════════════ */

@Injectable()
export class DashboardService implements OnModuleInit {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;
  private sheetName: string;
  private sheetName1: string;
  private sheetName2: string;

  private readonly cache = new Map<string, CacheEntry>();
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly configService: ConfigService) {}

  /* ──────────────────────────────────────────────
     Initialization
     ────────────────────────────────────────────── */

  async onModuleInit(): Promise<void> {
    const privateKey = this.configService
      .get<string>('PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    const auth = new google.auth.GoogleAuth({
      credentials: {
        type: this.configService.get<string>('TYPE'),
        project_id: this.configService.get<string>('PROJECT_ID'),
        private_key_id: this.configService.get<string>('PRIVATE_KEY_ID'),
        private_key: privateKey,
        client_email: this.configService.get<string>('CLIENT_EMAIL'),
        client_id: this.configService.get<string>('CLIENT_ID'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const authClient = await auth.getClient();
    this.sheets = google.sheets({
      version: 'v4',
      auth: authClient as InstanceType<typeof google.auth.JWT>,
    });

    this.spreadsheetId = this.configService.get<string>(
      'GOOGLE_SPREADSHEET_ID',
    )!;
    await this.discoverSheetNames();
  }

  private async discoverSheetNames(): Promise<void> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });

    const allSheets =
      spreadsheet.data.sheets?.map((s) => s.properties?.title ?? '') ?? [];

    this.sheetName = allSheets[1] ?? 'Sheet1';
    this.sheetName1 = allSheets[2] ?? 'Sheet2';
    this.sheetName2 = allSheets[3] ?? 'Sheet3';

    this.logger.log(`Sheet ทั้งหมด: ${JSON.stringify(allSheets)}`);
    this.logger.log(
      `Sheet หลัก: "${this.sheetName}" | รับเข้า: "${this.sheetName1}" | จ่ายออก: "${this.sheetName2}"`,
    );
  }

  /* ──────────────────────────────────────────────
     Cache Layer
     ────────────────────────────────────────────── */

  private async getSheetData(sheetName: string): Promise<string[][]> {
    const cached = this.cache.get(sheetName);

    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      this.logger.debug(`Cache hit: "${sheetName}"`);
      return cached.data;
    }

    this.logger.log(`Fetching from API: "${sheetName}"`);

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: sheetName,
    });

    const data = (res.data.values as string[][]) ?? [];
    this.cache.set(sheetName, { data, fetchedAt: Date.now() });
    return data;
  }

  /* ──────────────────────────────────────────────
     Shared Helpers
     ────────────────────────────────────────────── */

  /** สร้าง fiscal context จาก DTO (ใช้ร่วมกันทุก method) */
  private buildFiscalContext(dto: SearchDto): FiscalContext {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentFiscalYear =
      currentMonth >= 10 ? now.getFullYear() + 1 : now.getFullYear();

    const fiscalYear = Number(dto.financialYear) || currentFiscalYear;

    return {
      fiscalYear,
      targetMonth: dto.month ? Number(dto.month) : null,
      startYear: fiscalYear - 1,
    };
  }

  /** ตรวจว่า row อยู่ในปีงบประมาณหรือไม่ */
  private isInFiscalYear(
    rowYear: number,
    rowMonth: number,
    ctx: FiscalContext,
  ): boolean {
    return (
      (rowYear === ctx.startYear && rowMonth >= 10) ||
      (rowYear === ctx.fiscalYear && rowMonth <= 9)
    );
  }

  /** ตรวจว่า row ตรงเดือนที่ต้องการหรือไม่ (null = ทุกเดือน) */
  private matchesMonth(rowMonth: number, targetMonth: number | null): boolean {
    return targetMonth === null || rowMonth === targetMonth;
  }

  /** Parse "YYYY-MM" → [year, month] หรือ null ถ้า format ไม่ถูก */
  private parseYearMonth(ymStr: string): [number, number] | null {
    const trimmed = ymStr.trim();
    if (!trimmed) return null;

    const [yearStr, monthStr] = trimmed.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    return isNaN(year) || isNaN(month) ? null : [year, month];
  }

  /** Parse ตัวเลขจาก string (รองรับ comma) */
  // private parseNumber(raw: unknown): number {
  //   const val = parseFloat(String(raw ?? '0').replace(/,/g, ''));
  //   return isNaN(val) ? 0 : val;
  // }
  private parseNumber(raw: unknown): number {
    if (raw == null) return 0;
    const str =
      typeof raw === 'string'
        ? raw
        : typeof raw === 'number'
          ? String(raw)
          : '0';
    const val = parseFloat(str.replace(/,/g, ''));
    return isNaN(val) ? 0 : val;
  }

  /** หา column index จาก header */
  private findColumnIndices(headers: string[]): ColumnIndices | null {
    const name = headers.findIndex((h) =>
      h.includes(COLUMN_HEADERS.PRODUCT_NAME),
    );
    const value = headers.findIndex((h) =>
      h.includes(COLUMN_HEADERS.TOTAL_VALUE),
    );
    const yearMonth = headers.findIndex((h) =>
      h.includes(COLUMN_HEADERS.YEAR_MONTH),
    );

    if (name === -1 || value === -1 || yearMonth === -1) return null;
    return { name, value, yearMonth };
  }

  /** Aggregate มูลค่าตามชื่อสินค้า (ใช้ร่วมกัน Top10 Stock & TransOut) */
  private aggregateByName(
    rows: string[][],
    ctx: FiscalContext,
  ): Map<string, number> {
    const map = new Map<string, number>();
    if (rows.length <= 1) return map;

    const cols = this.findColumnIndices(rows[0]);
    if (!cols) return map;

    for (const row of rows.slice(1)) {
      const parsed = this.parseYearMonth(String(row[cols.yearMonth] ?? ''));
      if (!parsed) continue;

      const [rowYear, rowMonth] = parsed;
      if (!this.isInFiscalYear(rowYear, rowMonth, ctx)) continue;
      if (!this.matchesMonth(rowMonth, ctx.targetMonth)) continue;

      const name = String(row[cols.name] ?? '').trim();
      if (!name) continue;

      const val = this.parseNumber(row[cols.value]);
      if (val === 0) continue;

      map.set(name, (map.get(name) ?? 0) + val);
    }

    return map;
  }

  /** เรียงลำดับและตัด Top N */
  private topN(entries: NamedTotal[], n = TOP_N): NamedTotal[] {
    return entries.sort((a, b) => b.total - a.total).slice(0, n);
  }

  /* ──────────────────────────────────────────────
     API Methods
     ────────────────────────────────────────────── */

  async findTotalSKU(): Promise<{ total_of_SKU: number }> {
    const rows = await this.getSheetData(this.sheetName);
    return { total_of_SKU: Math.max(rows.length - 1, 0) };
  }

  async findTotalStockValue(): Promise<{
    total_stock_in: number;
    total_stock_out: number;
    total_stock_value: number;
  }> {
    const [rowsIn, rowsOut] = await Promise.all([
      this.getSheetData(this.sheetName1),
      this.getSheetData(this.sheetName2),
    ]);

    const sumValueColumn = (rows: string[][]): number => {
      if (rows.length <= 1) return 0;

      const colIndex = rows[0].findIndex((h) =>
        h.includes(COLUMN_HEADERS.TOTAL_VALUE),
      );
      if (colIndex === -1) return 0;

      return rows.slice(1).reduce((sum, row) => {
        const firstCell = String(row[0] ?? '').trim();
        if (!firstCell || firstCell.includes('รวม')) return sum;
        return sum + this.parseNumber(row[colIndex]);
      }, 0);
    };

    const totalIn = sumValueColumn(rowsIn);
    const totalOut = sumValueColumn(rowsOut);

    return {
      total_stock_in: totalIn,
      total_stock_out: totalOut,
      total_stock_value: totalIn - totalOut,
    };
  }

  async findMonthlyStockValue(
    dto: SearchDto,
  ): Promise<{ fiscalYear: number; months: MonthlyTotal[] }> {
    const [rowsIn, rowsOut] = await Promise.all([
      this.getSheetData(this.sheetName1),
      this.getSheetData(this.sheetName2),
    ]);

    const ctx = this.buildFiscalContext(dto);

    const aggregateByMonth = (rows: string[][]): Map<number, number> => {
      const map = new Map<number, number>();
      if (rows.length <= 1) return map;

      const headers = rows[0];
      const valueIdx = headers.findIndex((h) =>
        h.includes(COLUMN_HEADERS.TOTAL_VALUE),
      );
      const ymIdx = headers.findIndex((h) =>
        h.includes(COLUMN_HEADERS.YEAR_MONTH),
      );
      if (valueIdx === -1 || ymIdx === -1) return map;

      for (const row of rows.slice(1)) {
        const parsed = this.parseYearMonth(String(row[ymIdx] ?? ''));
        if (!parsed) continue;

        const [rowYear, rowMonth] = parsed;
        if (!this.isInFiscalYear(rowYear, rowMonth, ctx)) continue;

        const val = this.parseNumber(row[valueIdx]);
        if (val === 0) continue;

        map.set(rowMonth, (map.get(rowMonth) ?? 0) + val);
      }

      return map;
    };

    const stockInByMonth = aggregateByMonth(rowsIn);
    const stockOutByMonth = aggregateByMonth(rowsOut);

    const months: MonthlyTotal[] = FISCAL_MONTH_ORDER.map((month) => {
      const totalIn = stockInByMonth.get(month) ?? 0;
      const totalOut = stockOutByMonth.get(month) ?? 0;

      return {
        month,
        totalIn,
        totalOut,
        medSupply: totalOut > 0 ? totalIn / totalOut : 0,
      };
    });

    return { fiscalYear: ctx.fiscalYear, months };
  }

  async findTopTenStock(dto: SearchDto): Promise<NamedTotal[]> {
    const [rowsIn, rowsOut] = await Promise.all([
      this.getSheetData(this.sheetName1),
      this.getSheetData(this.sheetName2),
    ]);

    const ctx = this.buildFiscalContext(dto);
    const stockIn = this.aggregateByName(rowsIn, ctx);
    const stockOut = this.aggregateByName(rowsOut, ctx);

    const allNames = new Set([...stockIn.keys(), ...stockOut.keys()]);
    const result: NamedTotal[] = [];

    for (const name of allNames) {
      const total = (stockIn.get(name) ?? 0) - (stockOut.get(name) ?? 0);
      if (total > 0) result.push({ name, total });
    }

    return this.topN(result);
  }

  async findTopTenTransOut(dto: SearchDto): Promise<NamedTotal[]> {
    const rows = await this.getSheetData(this.sheetName2);

    const ctx = this.buildFiscalContext(dto);
    const aggregated = this.aggregateByName(rows, ctx);

    const result: NamedTotal[] = [...aggregated.entries()].map(
      ([name, total]) => ({ name, total }),
    );

    return this.topN(result);
  }
}
