import { useEffect, useState } from 'react';
import { Product } from '@/types/pos';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Plus } from 'lucide-react';
import { getNextBatchPrice } from '@/lib/db';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
}

export const ProductCard = ({ product, onAddToCart }: ProductCardProps) => {
  const isLowStock = product.stock < 10;
  const [displayPrice, setDisplayPrice] = useState<number>(product.price);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { price, error } = await getNextBatchPrice(product.id);
        if (!cancelled) {
          if (!error && price != null && price > 0) {
            setDisplayPrice(price);
          } else {
            setDisplayPrice(product.price);
          }
        }
      } catch (_) {
        if (!cancelled) {
          setDisplayPrice(product.price);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [product.id, product.stock, product.price]);

  return (
    <Card className="h-full hover:shadow-md transition-shadow duration-200 bg-card">
      <CardContent className="p-4 flex flex-col h-full">
        <div className="flex-1">
          <div className="flex items-center justify-center w-full h-20 bg-muted rounded-lg mb-3 overflow-hidden">
            {product.image ? (
              <img
                src={product.image}
                alt={product.name}
                className="h-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <Package className="w-8 h-8 text-muted-foreground" />
            )}
          </div>
          
          <h3 className="font-semibold text-sm mb-2 line-clamp-2">
            {product.name}
          </h3>
          
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-primary">
                ₱{displayPrice.toFixed(2)}
              </span>
            </div>
            <Badge 
              variant={isLowStock ? "destructive" : "secondary"}
              className="text-xs"
            >
              {product.stock} left
            </Badge>
          </div>
          
          <p className="text-xs text-muted-foreground mb-3">
            {product.category}
          </p>
        </div>
        
        <Button 
          onClick={() => onAddToCart(product)}
          disabled={product.stock === 0}
          className="w-full mt-auto"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add to Cart
        </Button>
      </CardContent>
    </Card>
  );
};