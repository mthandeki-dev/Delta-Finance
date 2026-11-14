// Shapes shared between the dashboard API and the client components.

export type UserView = {
  id: string;
  fullName: string | null;
  username: string | null;
  email: string | null;
  xrplAddress: string | null;
  role: 'ADMIN' | 'VIEWER';
  active: boolean;
  requirePasswordChange: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
};

export type TxView = {
  id: string;
  createdAt: string;
  actor: string;
  prompt: string;
  amountRlusd: string | null;
  merchantAddress: string | null;
  vendorLabel: string | null;
  isPayroll: boolean;
  route: 'AUTONOMOUS' | 'HITL' | 'BLOCKED';
  status: 'PENDING' | 'PENDING_HITL' | 'AWAITING_SIGNATURE' | 'EXECUTED' | 'BLOCKED' | 'REJECTED' | 'FAILED';
  blockedBy: 'INTENT_VALIDATION' | 'APP_POLICY' | 'BACKEND_VERIFICATION' | 'X402_GATEWAY' | 'PRIVY_POLICY' | 'T54_FACILITATOR' | null;
  reason: string | null;
  whitelisted: boolean;
  txHash: string | null;
  settledVia: string | null;
};

export type VendorView = { id: string; label: string; xrplAddress: string; country: string | null; isVendor: boolean; createdAt: string };

export type SecretCodeView = {
  id: string;
  prefix: string;
  label: string | null;
  createdAt: string;
  expiresAt: string;
  state: 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';
};

export type DashboardData = {
  user: {
    id: string;
    xrplAddress: string | null;
    username: string | null;
    fullName: string | null;
    email: string | null;
    role: 'ADMIN' | 'VIEWER';
    requirePasswordChange: boolean;
  };
  policy: {
    agentEnabled: boolean;
    dailyLimitRlusd: string;
    perTxLimitRlusd: string;
    spentTodayRlusd: string;
    privySyncedAt: string | null;
    privySyncError: string | null;
    updatedAt: string;
  };
  vendors: VendorView[];
  secretCodes: SecretCodeView[];
  transactions: TxView[];
  agentWallet: { address: string; trustlineSet: boolean } | null;
  config: {
    privy: boolean;
    xaman: boolean;
    llm: boolean;
    vulavulaStt: boolean;
    googleStt: boolean;
    displayFx: { code: string; rate: number } | null;
    explorerTx: string;
  };
};

export type WalletStatus = {
  address: string;
  activated: boolean;
  xrpBalance: string;
  rlusdTrustline: boolean;
  rlusdBalance: string;
  reachable: boolean;
} | null;

export type AgentResult = {
  id: string;
  route: TxView['route'];
  status: TxView['status'];
  blockedBy: TxView['blockedBy'];
  reason: string | null;
  txHash: string | null;
  intent: { action: 'PAY'; amount: number; merchant_address: string; is_payroll: boolean } | null;
};

export type InventoryItem = {
  id: string;
  itemName: string;
  unit: string;
  currentStock: number;
  minimumThreshold: number;
  restockQuantity: number;
  unitPriceRlusd: number;
  maxSpendLimit: number;
  fulfillmentChannel: 'XRPL_VENDOR' | 'EXTERNAL_WEB';
  vendorName: string;
  vendorWalletAddress: string | null;
  externalProductUrl: string | null;
  restockStatus: 'IDLE' | 'PENDING_PAYMENT' | 'ORDERED' | 'MANUAL_REVIEW';
  lastRestockAt: string | null;
  lastRestockTxHash: string | null;
  lastRestockOrderId: string | null;
  screenshotPath: string | null;
  active: boolean;
  createdAt: string;
};

export type AnalyticsData = {
  monthlySpend: { month: string; amountRlusd: number }[];
  itemSpend: { itemName: string; amountRlusd: number }[];
  inventoryLevels: { itemName: string; currentStock: number; minimumThreshold: number; unit: string; restockStatus: string; pendingStock: number }[];
  summary: { totalOutRlusd: number; totalInRlusd: number };
};

export type FinanceAdmin = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
};
