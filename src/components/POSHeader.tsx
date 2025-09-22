import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Settings, User, ShoppingCart, Plus, LogOut, Sun, Moon } from 'lucide-react';
import { User as UserType } from '@/types/auth';
import { useTheme } from '@/hooks/useTheme';

interface POSHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  cartItemCount: number;
  user: UserType;
  onAddProduct: () => void;
  onLogout: () => void;
  onGoAdmin?: () => void;
}

export const POSHeader = ({ searchQuery, onSearchChange, cartItemCount, user, onAddProduct, onLogout, onGoAdmin }: POSHeaderProps) => {
  const { isDark, toggle } = useTheme();
  return (
    <header className="bg-card border-b border-border px-6 py-4 sticky top-0 z-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-primary">Smart Stock Pulse</h1>
          <Badge variant="secondary" className="text-xs">
            v1.0
          </Badge>
        </div>
        
        <div className="flex-1 max-w-md mx-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search products or scan barcode..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 pr-4"
            />
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {user.role === 'admin' && (
            <>
              <Button variant="default" size="sm" onClick={onAddProduct}>
                <Plus className="w-4 h-4 mr-1" />
                Add Product
              </Button>
              {onGoAdmin && (
                <Button variant="outline" size="sm" onClick={onGoAdmin}>Admin</Button>
              )}
            </>
          )}
          
          <div className="relative">
            <Button variant="ghost" size="sm" className="relative">
              <ShoppingCart className="w-4 h-4" />
              {cartItemCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                >
                  {cartItemCount}
                </Badge>
              )}
            </Button>
          </div>
          
          <div className="flex items-center space-x-1 px-2 py-1 bg-muted rounded-lg">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{user.name}</span>
            <Badge variant={user.role === 'admin' ? 'destructive' : 'secondary'} className="text-xs">
              {user.role}
            </Badge>
          </div>
          
          <Button variant="ghost" size="sm" onClick={toggle} aria-label="Toggle theme">
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>

          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
};