import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface CategoryFilterProps {
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  productCounts: Record<string, number>;
}

export const CategoryFilter = ({ 
  categories, 
  selectedCategory, 
  onCategoryChange, 
  productCounts 
}: CategoryFilterProps) => {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {categories.map((category) => (
        <Button
          key={category}
          variant={selectedCategory === category ? "default" : "outline"}
          onClick={() => onCategoryChange(category)}
          className="relative"
          size="sm"
        >
          {category}
          <Badge 
            variant="secondary" 
            className="ml-2 text-xs bg-background/80 text-foreground"
          >
            {productCounts[category] || 0}
          </Badge>
        </Button>
      ))}
    </div>
  );
};