// NAV Online Számla integráció — interfész-vázlat (11. fejezet).
// A tényleges API-hívások helyett mock adatok; a bekötéshez a NAV Online Számla 3.0
// REST API-t kell implementálni (technikai felhasználó + aláírókulcs a beállításokban).

export interface NavCredentials {
  login: string;
  password: string;
  taxNumber: string;
  signatureKey: string;
  exchangeKey: string;
}

export interface InvoiceDigest {
  invoiceNumber: string;
  supplierTaxNumber: string;
  supplierName: string;
  issueDate: string;
  invoiceNetAmount: number;
  invoiceVatAmount: number;
  currencyCode: string;
}

export interface InvoiceDataResult {
  invoiceNumber: string;
  invoiceXmlBase64: string;
}

export interface NavClient {
  /** Számlakivonatok lekérdezése időszakra (queryInvoiceDigest). */
  queryInvoiceDigest(params: {
    direction: "INBOUND" | "OUTBOUND";
    dateFrom: string;
    dateTo: string;
    page?: number;
  }): Promise<{ digests: InvoiceDigest[]; availablePages: number }>;

  /** Teljes számlaadat lekérdezése (queryInvoiceData). */
  queryInvoiceData(params: {
    invoiceNumber: string;
    direction: "INBOUND" | "OUTBOUND";
  }): Promise<InvoiceDataResult | null>;
}

/** Mock kliens — fejlesztéshez; élesben cseréld valós implementációra. */
export function createNavClient(_credentials?: Partial<NavCredentials>): NavClient {
  return {
    async queryInvoiceDigest() {
      return {
        digests: [
          {
            invoiceNumber: "MOCK-2026/001",
            supplierTaxNumber: "12345678-2-41",
            supplierName: "Minta Szállító Kft.",
            issueDate: "2026-08-01",
            invoiceNetAmount: 100000,
            invoiceVatAmount: 27000,
            currencyCode: "HUF",
          },
        ],
        availablePages: 1,
      };
    },
    async queryInvoiceData(params) {
      return { invoiceNumber: params.invoiceNumber, invoiceXmlBase64: "" };
    },
  };
}
