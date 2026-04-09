import java.util.Objects;
import java.util.ArrayList;
import java.util.List;

public class ProductEntity {
    private Long id;
    private String name;
    private String description;
    private String category;
    private String brand;
    private double price;
    private double weight;
    private int stockQuantity;
    private boolean available;
    private String sku;

    public ProductEntity() {}

    public ProductEntity(Long id, String name, String description, String category, String brand,
                         double price, double weight, int stockQuantity, boolean available, String sku) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.category = category;
        this.brand = brand;
        this.price = price;
        this.weight = weight;
        this.stockQuantity = stockQuantity;
        this.available = available;
        this.sku = sku;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getBrand() { return brand; }
    public void setBrand(String brand) { this.brand = brand; }
    public double getPrice() { return price; }
    public void setPrice(double price) { this.price = price; }
    public double getWeight() { return weight; }
    public void setWeight(double weight) { this.weight = weight; }
    public int getStockQuantity() { return stockQuantity; }
    public void setStockQuantity(int stockQuantity) { this.stockQuantity = stockQuantity; }
    public boolean isAvailable() { return available; }
    public void setAvailable(boolean available) { this.available = available; }
    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }

    public boolean isInStock() { return stockQuantity > 0 && available; }

    public double getDiscountedPrice(double discountPercent) {
        return price * (1 - discountPercent / 100);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        ProductEntity that = (ProductEntity) o;
        return Objects.equals(id, that.id) && Objects.equals(sku, that.sku);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, sku);
    }

    @Override
    public String toString() {
        return "Product{id=" + id + ", name='" + name + "', price=" + price +
               ", stock=" + stockQuantity + ", available=" + available + "}";
    }

    public static void main(String[] args) {
        List<ProductEntity> products = new ArrayList<>();
        products.add(new ProductEntity(1L, "Laptop", "High-performance laptop", "Electronics", "TechBrand",
            999.99, 2.5, 50, true, "TECH-001"));
        products.add(new ProductEntity(2L, "Mouse", "Wireless mouse", "Electronics", "TechBrand",
            29.99, 0.1, 200, true, "TECH-002"));
        products.add(new ProductEntity(3L, "Keyboard", "Mechanical keyboard", "Electronics", "TechBrand",
            79.99, 0.8, 0, false, "TECH-003"));

        for (ProductEntity p : products) {
            System.out.println(p + " | inStock=" + p.isInStock() +
                " | 10%off=" + String.format("%.2f", p.getDiscountedPrice(10)));
        }

        System.out.println("p1 equals p1: " + products.get(0).equals(products.get(0)));
        System.out.println("p1 equals p2: " + products.get(0).equals(products.get(1)));
    }
}
