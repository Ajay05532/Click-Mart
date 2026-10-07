import type { StoreOrder } from '../types.ts'

export const seedOrders: StoreOrder[] = [
  {
    id: 'ORD-1048',
    customer: 'Priya Sharma',
    items: 'Premium Almonds, Walnuts',
    amount: 1248,
    status: 'Delivered',
    date: '04 Oct 2026',
  },
  {
    id: 'ORD-1047',
    customer: 'Rahul Verma',
    items: 'Cashews (W240)',
    amount: 689,
    status: 'Processing',
    date: '04 Oct 2026',
  },
  {
    id: 'ORD-1046',
    customer: 'Anjali Singh',
    items: 'Mixed Dry Fruits, Pistachios',
    amount: 1498,
    status: 'Shipped',
    date: '03 Oct 2026',
  },
  {
    id: 'ORD-1045',
    customer: 'Vikram Patel',
    items: 'Premium Almonds',
    amount: 449,
    status: 'Delivered',
    date: '03 Oct 2026',
  },
  {
    id: 'ORD-1044',
    customer: 'Neha Gupta',
    items: 'Pistachios',
    amount: 899,
    status: 'Shipped',
    date: '02 Oct 2026',
  },
]

export const customers = [
  { name: 'Priya Sharma', city: 'Mumbai', orders: 8, spent: 6420 },
  { name: 'Rahul Verma', city: 'Bengaluru', orders: 5, spent: 3890 },
  { name: 'Anjali Singh', city: 'Delhi', orders: 6, spent: 4510 },
  { name: 'Vikram Patel', city: 'Ahmedabad', orders: 3, spent: 1870 },
  { name: 'Neha Gupta', city: 'Pune', orders: 4, spent: 2760 },
]
