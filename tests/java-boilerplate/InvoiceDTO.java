import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class InvoiceDTO {

    public static class LineItem {
        private String description;
        private int quantity;
        private double unitPrice;

        public LineItem() {}

        public LineItem(String description, int quantity, double unitPrice) {
            this.description = description;
            this.quantity = quantity;
            this.unitPrice = unitPrice;
        }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public int getQuantity() { return quantity; }
        public void setQuantity(int quantity) { this.quantity = quantity; }
        public double getUnitPrice() { return unitPrice; }
        public void setUnitPrice(double unitPrice) { this.unitPrice = unitPrice; }

        public double getLineTotal() { return quantity * unitPrice; }

        @Override
        public String toString() {
            return description + " x" + quantity + " @" + String.format("%.2f", unitPrice) +
                   " = " + String.format("%.2f", getLineTotal());
        }
    }

    private Long invoiceNumber;
    private String customerName;
    private String customerEmail;
    private String billingAddress;
    private String shippingAddress;
    private List<LineItem> items;
    private double taxRate;
    private String notes;
    private String status;

    public InvoiceDTO() {
        this.items = new ArrayList<>();
    }

    public InvoiceDTO(Long invoiceNumber, String customerName, String customerEmail) {
        this.invoiceNumber = invoiceNumber;
        this.customerName = customerName;
        this.customerEmail = customerEmail;
        this.items = new ArrayList<>();
        this.taxRate = 0.08;
        this.status = "DRAFT";
    }

    public Long getInvoiceNumber() { return invoiceNumber; }
    public void setInvoiceNumber(Long invoiceNumber) { this.invoiceNumber = invoiceNumber; }
    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }
    public String getCustomerEmail() { return customerEmail; }
    public void setCustomerEmail(String customerEmail) { this.customerEmail = customerEmail; }
    public String getBillingAddress() { return billingAddress; }
    public void setBillingAddress(String billingAddress) { this.billingAddress = billingAddress; }
    public String getShippingAddress() { return shippingAddress; }
    public void setShippingAddress(String shippingAddress) { this.shippingAddress = shippingAddress; }
    public List<LineItem> getItems() { return items; }
    public void setItems(List<LineItem> items) { this.items = items; }
    public double getTaxRate() { return taxRate; }
    public void setTaxRate(double taxRate) { this.taxRate = taxRate; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public void addItem(String description, int quantity, double unitPrice) {
        items.add(new LineItem(description, quantity, unitPrice));
    }

    public double getSubtotal() {
        double total = 0;
        for (LineItem item : items) {
            total += item.getLineTotal();
        }
        return total;
    }

    public double getTaxAmount() {
        return getSubtotal() * taxRate;
    }

    public double getGrandTotal() {
        return getSubtotal() + getTaxAmount();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        InvoiceDTO that = (InvoiceDTO) o;
        return Objects.equals(invoiceNumber, that.invoiceNumber);
    }

    @Override
    public int hashCode() {
        return Objects.hash(invoiceNumber);
    }

    @Override
    public String toString() {
        return "Invoice{#" + invoiceNumber + ", customer='" + customerName +
               "', items=" + items.size() + ", total=" + String.format("%.2f", getGrandTotal()) +
               ", status='" + status + "'}";
    }

    public static void main(String[] args) {
        InvoiceDTO inv = new InvoiceDTO(1001L, "Acme Corp", "billing@acme.com");
        inv.setBillingAddress("100 Business Ave, Suite 200");
        inv.addItem("Widget A", 10, 25.00);
        inv.addItem("Widget B", 5, 45.50);
        inv.addItem("Service Fee", 1, 100.00);

        System.out.println(inv);
        System.out.println("Items:");
        for (LineItem item : inv.getItems()) {
            System.out.println("  " + item);
        }
        System.out.println("Subtotal: " + String.format("%.2f", inv.getSubtotal()));
        System.out.println("Tax (" + String.format("%.0f", inv.getTaxRate() * 100) + "%): " +
                           String.format("%.2f", inv.getTaxAmount()));
        System.out.println("Grand Total: " + String.format("%.2f", inv.getGrandTotal()));

        InvoiceDTO inv2 = new InvoiceDTO(1001L, "Different", "other@co.com");
        System.out.println("Same invoice? " + inv.equals(inv2));
    }
}
