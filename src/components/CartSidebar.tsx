import { CartItem, PaymentMethod } from '@/types/pos';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Trash2, Minus, Plus, CreditCard, Banknote, Smartphone, Package } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface CartSidebarProps {
  cartItems: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  total: number;
}

export const CartSidebar = ({ 
  cartItems, 
  onUpdateQuantity, 
  onRemoveItem, 
  onClearCart,
  total 
}: CartSidebarProps) => {
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('card');
  const { toast } = useToast();

  const paymentMethods = [
    { id: 'card' as PaymentMethod, label: 'Card', icon: CreditCard },
    { id: 'cash' as PaymentMethod, label: 'Cash', icon: Banknote },
    { id: 'digital' as PaymentMethod, label: 'Digital', icon: Smartphone },
  ];

  const handleCheckout = () => {
    if (cartItems.length === 0) {
      toast({
        title: "Cart is empty",
        description: "Please add items to cart before checkout",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Transaction completed!",
      description: `Payment of ₱${total.toFixed(2)} processed successfully`,
    });

    onClearCart();
  };

  const tax = total * 0.08; // 8% tax rate
  const finalTotal = total + tax;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <span>Cart ({cartItems.length})</span>
          {cartItems.length > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClearCart}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col">
        {cartItems.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center">
            <div>
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Package className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Your cart is empty</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 mb-6">
              {cartItems.map((item) => (
                <div key={item.product.id} className="bg-accent/50 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-sm flex-1 pr-2">
                      {item.product.name}
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveItem(item.product.id)}
                      className="h-auto p-1 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                        className="h-8 w-8 p-0"
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      
                      <Badge variant="secondary" className="min-w-[2rem] justify-center">
                        {item.quantity}
                      </Badge>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                        className="h-8 w-8 p-0"
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    
                    <span className="font-semibold text-primary">
                      ₱{(item.product.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <Separator />
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>₱{total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Tax (8%):</span>
                  <span>₱{tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total:</span>
                  <span className="text-primary">₱{finalTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-sm">Payment Method</h4>
                <div className="grid grid-cols-3 gap-2">
                  {paymentMethods.map((method) => {
                    const Icon = method.icon;
                    return (
                      <Button
                        key={method.id}
                        variant={selectedPayment === method.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedPayment(method.id)}
                        className="flex flex-col h-auto py-3"
                      >
                        <Icon className="w-4 h-4 mb-1" />
                        <span className="text-xs">{method.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              <Button 
                onClick={handleCheckout}
                className="w-full h-12 text-base font-semibold"
                size="lg"
              >
                Complete Sale - ₱{finalTotal.toFixed(2)}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};