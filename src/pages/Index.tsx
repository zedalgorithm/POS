import { useState, useMemo } from 'react';
import { POSHeader } from '@/components/POSHeader';
import { CategoryFilter } from '@/components/CategoryFilter';
import { ProductCard } from '@/components/ProductCard';
import { CartSidebar } from '@/components/CartSidebar';
import { mockProducts, categories } from '@/data/mockData';
import { useCart } from '@/hooks/useCart';

const Index = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
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
    return mockProducts.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           product.barcode?.includes(searchQuery) ||
                           product.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  const productCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    categories.forEach(category => {
      if (category === 'All') {
        counts[category] = mockProducts.length;
      } else {
        counts[category] = mockProducts.filter(p => p.category === category).length;
      }
    });
    return counts;
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <POSHeader 
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        cartItemCount={getTotalItems()}
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
