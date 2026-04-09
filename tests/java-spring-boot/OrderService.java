import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class OrderService {

    public enum OrderStatus {
        PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED
    }

    public static class OrderItem {
        private String productName;
        private int quantity;
        private double price;

        public OrderItem() {}

        public OrderItem(String productName, int quantity, double price) {
            this.productName = productName;
            this.quantity = quantity;
            this.price = price;
        }

        public String getProductName() { return productName; }
        public void setProductName(String productName) { this.productName = productName; }
        public int getQuantity() { return quantity; }
        public void setQuantity(int quantity) { this.quantity = quantity; }
        public double getPrice() { return price; }
        public void setPrice(double price) { this.price = price; }
        public double getTotal() { return quantity * price; }

        @Override
        public String toString() {
            return productName + " x" + quantity + " @" + price;
        }
    }

    public static class Order {
        private long id;
        private String customerName;
        private List<OrderItem> items;
        private OrderStatus status;
        private double totalAmount;

        public Order() { this.items = new ArrayList<>(); }

        public Order(long id, String customerName) {
            this.id = id;
            this.customerName = customerName;
            this.items = new ArrayList<>();
            this.status = OrderStatus.PENDING;
        }

        public long getId() { return id; }
        public void setId(long id) { this.id = id; }
        public String getCustomerName() { return customerName; }
        public void setCustomerName(String customerName) { this.customerName = customerName; }
        public List<OrderItem> getItems() { return items; }
        public void setItems(List<OrderItem> items) { this.items = items; }
        public OrderStatus getStatus() { return status; }
        public void setStatus(OrderStatus status) { this.status = status; }
        public double getTotalAmount() { return totalAmount; }

        public void addItem(OrderItem item) {
            items.add(item);
            recalculateTotal();
        }

        private void recalculateTotal() {
            totalAmount = items.stream().mapToDouble(OrderItem::getTotal).sum();
        }

        @Override
        public String toString() {
            return "Order{id=" + id + ", customer='" + customerName + "', status=" + status +
                   ", items=" + items.size() + ", total=" + String.format("%.2f", totalAmount) + "}";
        }
    }

    private final List<Order> orders = new ArrayList<>();
    private long nextId = 1;

    public Order createOrder(String customerName) {
        Order order = new Order(nextId++, customerName);
        orders.add(order);
        return order;
    }

    public Optional<Order> findById(long id) {
        return orders.stream().filter(o -> o.getId() == id).findFirst();
    }

    public List<Order> findByStatus(OrderStatus status) {
        return orders.stream()
            .filter(o -> o.getStatus() == status)
            .collect(Collectors.toList());
    }

    public List<Order> findByCustomer(String customerName) {
        return orders.stream()
            .filter(o -> o.getCustomerName().equalsIgnoreCase(customerName))
            .collect(Collectors.toList());
    }

    public boolean updateStatus(long id, OrderStatus newStatus) {
        return findById(id).map(order -> {
            order.setStatus(newStatus);
            return true;
        }).orElse(false);
    }

    public double getTotalRevenue() {
        return orders.stream()
            .filter(o -> o.getStatus() != OrderStatus.CANCELLED)
            .mapToDouble(Order::getTotalAmount)
            .sum();
    }

    public Map<OrderStatus, Long> getOrderCountByStatus() {
        return orders.stream()
            .collect(Collectors.groupingBy(Order::getStatus, Collectors.counting()));
    }
}
