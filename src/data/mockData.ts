import { Product } from '@/types/pos';

export const mockProducts: Product[] = [
  {
    id: '1',
    name: 'Premium Coffee Beans',
    price: 1249.99,
    category: 'Beverages',
    stock: 45,
    barcode: '123456789012',
  },
  {
    id: '2',
    name: 'Artisan Chocolate Bar',
    price: 425.00,
    category: 'Snacks',
    stock: 32,
    barcode: '123456789013',
  },
  {
    id: '3',
    name: 'Organic Green Tea',
    price: 787.50,
    category: 'Beverages',
    stock: 28,
    barcode: '123456789014',
  },
  {
    id: '4',
    name: 'Gourmet Sandwich',
    price: 600.00,
    category: 'Food',
    stock: 15,
    barcode: '123456789015',
  },
  {
    id: '5',
    name: 'Fresh Pastry',
    price: 312.50,
    category: 'Food',
    stock: 22,
    barcode: '123456789016',
  },
  {
    id: '6',
    name: 'Energy Drink',
    price: 199.50,
    category: 'Beverages',
    stock: 56,
    barcode: '123456789017',
  },
  {
    id: '7',
    name: 'Protein Bar',
    price: 225.00,
    category: 'Snacks',
    stock: 38,
    barcode: '123456789018',
  },
  {
    id: '8',
    name: 'Mineral Water',
    price: 100.00,
    category: 'Beverages',
    stock: 84,
    barcode: '123456789019',
  },
];

export const categories = ['All', 'Beverages', 'Food', 'Snacks'];