// Előre elkészített CSV import-sablonok magyar bankokhoz (11. fejezet).
// A mezők a bank CSV-fejlécének oszlopneveire mutatnak.

export interface CsvTemplate {
  id: string;
  bankName: string;
  delimiter: string;
  encoding: string;
  dateFormat: string;
  columns: {
    bookingDate: string;
    valueDate?: string;
    amount: string;
    currency?: string;
    counterpartyName?: string;
    counterpartyAccount?: string;
    reference?: string;
    transactionType?: string;
  };
  /** Az összeg formátuma: "signed" (előjeles) vagy külön terhelés/jóváírás oszlop. */
  amountStyle: "signed" | "debitCredit";
  debitColumn?: string;
  creditColumn?: string;
}

export const BANK_TEMPLATES: CsvTemplate[] = [
  {
    id: "otp",
    bankName: "OTP Bank",
    delimiter: ";",
    encoding: "iso-8859-2",
    dateFormat: "yyyy.MM.dd.",
    amountStyle: "signed",
    columns: {
      bookingDate: "Tranzakció dátuma",
      valueDate: "Értéknap",
      amount: "Összeg",
      currency: "Devizanem",
      counterpartyName: "Ellenoldali név",
      counterpartyAccount: "Ellenoldali számlaszám",
      reference: "Közlemény",
      transactionType: "Forgalom típusa",
    },
  },
  {
    id: "kh",
    bankName: "K&H Bank",
    delimiter: ";",
    encoding: "utf-8",
    dateFormat: "yyyy.MM.dd",
    amountStyle: "signed",
    columns: {
      bookingDate: "Könyvelés dátuma",
      valueDate: "Értéknap",
      amount: "Összeg",
      currency: "Deviza",
      counterpartyName: "Partner neve",
      counterpartyAccount: "Partner számlaszáma",
      reference: "Közlemény",
    },
  },
  {
    id: "erste",
    bankName: "Erste Bank",
    delimiter: ";",
    encoding: "utf-8",
    dateFormat: "yyyy.MM.dd.",
    amountStyle: "signed",
    columns: {
      bookingDate: "Dátum",
      amount: "Összeg",
      currency: "Deviza",
      counterpartyName: "Megbízó/Kedvezményezett",
      reference: "Közlemény",
    },
  },
  {
    id: "raiffeisen",
    bankName: "Raiffeisen Bank",
    delimiter: ";",
    encoding: "utf-8",
    dateFormat: "yyyy.MM.dd",
    amountStyle: "signed",
    columns: {
      bookingDate: "Könyvelés dátuma",
      valueDate: "Esedékesség",
      amount: "Összeg",
      counterpartyName: "Partner",
      reference: "Közlemény",
    },
  },
  {
    id: "unicredit",
    bankName: "UniCredit Bank",
    delimiter: ";",
    encoding: "utf-8",
    dateFormat: "yyyy.MM.dd",
    amountStyle: "signed",
    columns: {
      bookingDate: "Könyvelési dátum",
      valueDate: "Értéknap",
      amount: "Összeg",
      currency: "Devizanem",
      counterpartyName: "Partner név",
      counterpartyAccount: "Partner számlaszám",
      reference: "Közlemény 1",
    },
  },
  {
    id: "wise",
    bankName: "Wise",
    delimiter: ",",
    encoding: "utf-8",
    dateFormat: "dd-MM-yyyy",
    amountStyle: "signed",
    columns: {
      bookingDate: "Date",
      amount: "Amount",
      currency: "Currency",
      counterpartyName: "Merchant",
      reference: "Description",
    },
  },
  {
    id: "revolut",
    bankName: "Revolut Business",
    delimiter: ",",
    encoding: "utf-8",
    dateFormat: "yyyy-MM-dd",
    amountStyle: "signed",
    columns: {
      bookingDate: "Date completed (UTC)",
      amount: "Amount",
      currency: "Payment currency",
      counterpartyName: "Beneficiary account name",
      reference: "Reference",
    },
  },
];
