import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Plus, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Product } from '@/types/pos';
import { addProduct } from '@/lib/db';
import { supabase } from '@/lib/supabaseClient';

interface AddProductProps {
  onBack: () => void;
  onAddProduct: (product: Product) => void;
}

export const AddProduct = ({ onBack, onAddProduct }: AddProductProps) => {
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    boughtPrice: '',
    category: '',
    stock: '',
    barcode: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const categories = ['Beverages', 'Food', 'Snacks', 'Electronics', 'Clothing', 'Health & Beauty'];

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.name.trim()) {
      setError('Product name is required');
      return;
    }
    if (!formData.price || parseFloat(formData.price) <= 0) {
      setError('Please enter a valid price');
      return;
    }
    if (formData.boughtPrice && parseFloat(formData.boughtPrice) <= 0) {
      setError('Bought price must be greater than 0 if provided');
      return;
    }
    if (!formData.category) {
      setError('Please select a category');
      return;
    }
    if (!formData.stock || parseInt(formData.stock) < 0) {
      setError('Please enter a valid stock quantity');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1) If there is an image, upload it to Supabase Storage first
      let imageUrl: string | null = null;
      if (imageFile) {
        const bucket = 'product-images';
        const fileExt = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const safeName = formData.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const filePath = `${safeName}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, imageFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: imageFile.type || 'image/jpeg',
          });
        if (uploadError) {
          setError(uploadError.message || 'Failed to upload image');
          return;
        }
        const { data: pub } = supabase.storage.from(bucket).getPublicUrl(filePath);
        imageUrl = pub?.publicUrl || null;
      }

      // 2) Create the product with the image URL (if any)
      const { data, error: dbError } = await addProduct({
        name: formData.name.trim(),
        price: parseFloat(formData.price),
        bought_price: formData.boughtPrice ? parseFloat(formData.boughtPrice) : null,
        category: formData.category,
        stock: parseInt(formData.stock, 10),
        barcode: formData.barcode.trim() || null,
        image: imageUrl,
      });
      if (dbError || !data) {
        setError(dbError?.message || 'Failed to add product.');
        return;
      }

      // Update local UI for immediate feedback with full Product (includes id)
      onAddProduct({
        id: data.id,
        name: data.name,
        price: Number(data.price),
        category: data.category,
        stock: data.stock,
        barcode: data.barcode ?? undefined,
        boughtPrice: data.bought_price != null ? Number(data.bought_price) : undefined,
        image: data.image ?? undefined,
      });

      toast({
        title: 'Product added successfully!',
        description: `${data.name} has been added to the inventory.`,
      });

      // Reset form
      setFormData({
        name: '',
        price: '',
        boughtPrice: '',
        category: '',
        stock: '',
        barcode: ''
      });
      setImageFile(null);
      setImagePreview(null);

    } catch (err: any) {
      setError(err?.message || 'Failed to add product. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setImageFile(null);
      setImagePreview(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }
    // Optional: limit file size to 5MB
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('Image size must be less than 5MB');
      return;
    }
    setError('');
    setImageFile(file);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={onBack}
            className="mb-4 -ml-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to POS
          </Button>
          
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Add New Product</h1>
              <p className="text-muted-foreground">Add a new product to your inventory</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Product Information</CardTitle>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter product name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="price">Price (₱) *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.price}
                    onChange={(e) => handleInputChange('price', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="boughtPrice">Bought Price (₱)</Label>
                  <Input
                    id="boughtPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.boughtPrice}
                    onChange={(e) => handleInputChange('boughtPrice', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select 
                    value={formData.category} 
                    onValueChange={(value) => handleInputChange('category', value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stock">Stock Quantity *</Label>
                  <Input
                    id="stock"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formData.stock}
                    onChange={(e) => handleInputChange('stock', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="barcode">Barcode (Optional)</Label>
                  <Input
                    id="barcode"
                    type="text"
                    placeholder="Enter barcode"
                    value={formData.barcode}
                    onChange={(e) => handleInputChange('barcode', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="image">Product Image (Optional)</Label>
                  <Input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    disabled={isSubmitting}
                  />
                  {imagePreview && (
                    <div className="mt-2">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="h-32 w-32 object-cover rounded border"
                      />
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3 pt-4">
                <Button type="submit" disabled={isSubmitting} className="flex-1">
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-r-transparent rounded-full animate-spin mr-2" />
                      Adding Product...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Product
                    </>
                  )}
                </Button>
                
                <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};