export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface Money {
  amount: number;
  currency: string;
}
