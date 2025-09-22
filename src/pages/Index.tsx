import { useState, useMemo, useEffect } from 'react';
import { POSHeader } from '@/components/POSHeader';
import { CategoryFilter } from '@/components/CategoryFilter';
import { ProductCard } from '@/components/ProductCard';
import { CartSidebar } from '@/components/CartSidebar';
import { Login } from '@/components/Login';
import { AddProduct } from '@/components/AddProduct';
import { categories } from '@/data/mockData';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { Product } from '@/types/pos';
import { useNavigate } from 'react-router-dom';
import { listProducts } from '@/lib/db';
import { getProductsCache, saveProductsCache } from '@/lib/offlineDB';

const Index = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [currentView, setCurrentView] = useState<'pos' | 'add-product'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const navigate = useNavigate();
  
  const { user, isAuthenticated, logout } = useAuth();
  
  const {
    cartItems,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getTotal,
    getTotalItems,
  } = useCart();

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           product.barcode?.includes(searchQuery) ||
                           product.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory, products]);

  const productCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    categories.forEach(category => {
      if (category === 'All') {
        counts[category] = products.length;
      } else {
        counts[category] = products.filter(p => p.category === category).length;
      }
    });
    return counts;
  }, [products]);

  const handleAddProduct = (savedProduct: Product) => {
    setProducts(prev => [savedProduct, ...prev]);
    setCurrentView('pos');
  };

  useEffect(() => {
    (async () => {
      try {
        if (navigator.onLine) {
          const { data, error } = await listProducts();
          if (!error && data) {
            setProducts(data as Product[]);
            try { await saveProductsCache(data as any[]); } catch {}
            return;
          }
        }
        // Offline or failed: try cache
        const cached = await getProductsCache();
        if (cached && Array.isArray(cached)) {
          setProducts(cached as Product[]);
        }
      } catch (_) {
        const cached = await getProductsCache();
        if (cached && Array.isArray(cached)) setProducts(cached as Product[]);
      }
    })();
  }, []);

  // Show login if not authenticated
  if (!isAuthenticated || !user) {
    return <Login />;
  }

  // Show add product page
  if (currentView === 'add-product') {
    return (
      <AddProduct 
        onBack={() => setCurrentView('pos')}
        onAddProduct={handleAddProduct}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <POSHeader 
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        cartItemCount={getTotalItems()}
        user={user}
        onAddProduct={() => setCurrentView('add-product')}
        onLogout={logout}
        onGoAdmin={() => navigate('/admin')}
      />
      
      <div className="flex h-[calc(100vh-80px)]">
        {/* Main Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          <CategoryFilter
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            productCounts={productCounts}
          />
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={addToCart}
              />
            ))}
          </div>
          
          {filteredProducts.length === 0 && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <h3 className="text-lg font-medium text-muted-foreground mb-2">
                  No products found
                </h3>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search or category filter
                </p>
              </div>
            </div>
          )}
        </div>
        
        {/* Cart Sidebar */}
        <div className="w-80 border-l border-border bg-card">
          <CartSidebar
            cartItems={cartItems}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeFromCart}
            onClearCart={clearCart}
            total={getTotal()}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
