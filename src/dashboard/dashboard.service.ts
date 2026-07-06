import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';

@Injectable()
export class DashboardService implements OnModuleInit {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;
  private sheetName: string;
  private sheetName1: string;
  private sheetName2: string;
  private readonly logger = new Logger(DashboardService.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const auth = new google.auth.GoogleAuth({
      keyFile: this.configService.get<string>(
        'GOOGLE_SERVICE_ACCOUNT_KEY_PATH',
      ),
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

    // ดึงชื่อ Sheet จริงจาก Google Sheet
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const allSheets =
      spreadsheet.data.sheets?.map((s) => s.properties?.title || '') || [];
    this.logger.log(`📋 Sheet ทั้งหมด: ${JSON.stringify(allSheets)}`);

    this.sheetName = allSheets[0] || 'Sheet1';
    this.sheetName1 = allSheets.find((n) => n.includes('รับเข้า')) || '';
    this.sheetName2 = allSheets.find((n) => n.includes('จ่ายออก')) || '';

    this.logger.log(`✅ เชื่อมต่อสำเร็จ`);
    this.logger.log(`📌 Sheet หลัก: "${this.sheetName}"`);
    this.logger.log(`📌 Sheet รับเข้า: "${this.sheetName1}"`);
    this.logger.log(`📌 Sheet จ่ายออก: "${this.sheetName2}"`);
  }

  async findTotalSKU(): Promise<{ total_of_SKU: number }> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: this.sheetName,
    });

    const rows = res.data.values;
    if (!rows || rows.length <= 1) return { total_of_SKU: 0 };

    return { total_of_SKU: rows.length - 1 };
  }

  async findTotalStockValue(): Promise<{
    total_stock_in: number;
    total_stock_out: number;
    total_stock_value: number;
  }> {
    const resIn = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: this.sheetName1,
    });

    const resOut = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: this.sheetName2,
    });

    const sumColumn = (rows: any[][] | null | undefined): number => {
      if (!rows || rows.length <= 1) return 0;
      const headers = rows[0];
      const colIndex = headers.findIndex((h: string) =>
        h.includes('มูลค่ารวม'),
      );
      if (colIndex === -1) return 0;

      return rows.slice(1).reduce((sum, row) => {
        const val = parseFloat(String(row[colIndex] || '0').replace(/,/g, ''));
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
    };

    const totalIn = sumColumn(resIn.data.values);
    const totalOut = sumColumn(resOut.data.values);

    return {
      total_stock_in: totalIn,
      total_stock_out: totalOut,
      total_stock_value: totalIn - totalOut,
    };
  }
}
