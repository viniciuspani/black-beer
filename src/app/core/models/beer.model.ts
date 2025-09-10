// src/app/core/models/beer.model.ts
export interface BeerType {
  id: string;
  name: string;
  color: string;
  description: string;
}

export interface Sale {
  id: string;
  beerId: string;
  beerName: string;
  cupSize: 300 | 500;
  quantity: number;
  timestamp: string; // Usaremos string ISO para armazenar no SQLite
  totalVolume: number; // em ml
}

export interface AppSettings {
  emailSettings: {
    email: string;
    isConfigured: boolean;
  };
}

export interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}
