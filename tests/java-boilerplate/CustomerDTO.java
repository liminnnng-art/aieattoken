import java.util.Objects;

public class CustomerDTO {
    private Long id;
    private String firstName;
    private String lastName;
    private String email;
    private String phone;
    private String address;
    private String city;
    private String state;
    private String zipCode;
    private String country;
    private boolean active;

    public CustomerDTO() {}

    public CustomerDTO(Long id, String firstName, String lastName, String email, String phone,
                       String address, String city, String state, String zipCode, String country, boolean active) {
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.phone = phone;
        this.address = address;
        this.city = city;
        this.state = state;
        this.zipCode = zipCode;
        this.country = country;
        this.active = active;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getFirstName() { return firstName; }
    public void setFirstName(String firstName) { this.firstName = firstName; }
    public String getLastName() { return lastName; }
    public void setLastName(String lastName) { this.lastName = lastName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public String getZipCode() { return zipCode; }
    public void setZipCode(String zipCode) { this.zipCode = zipCode; }
    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public String getFullName() {
        return firstName + " " + lastName;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        CustomerDTO that = (CustomerDTO) o;
        return active == that.active && Objects.equals(id, that.id) &&
               Objects.equals(email, that.email);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, email, active);
    }

    @Override
    public String toString() {
        return "CustomerDTO{id=" + id + ", name='" + getFullName() + "', email='" + email +
               "', city='" + city + "', active=" + active + "}";
    }

    public static void main(String[] args) {
        CustomerDTO c1 = new CustomerDTO(1L, "John", "Doe", "john@example.com", "555-1234",
            "123 Main St", "Springfield", "IL", "62704", "US", true);
        CustomerDTO c2 = new CustomerDTO(2L, "Jane", "Smith", "jane@example.com", "555-5678",
            "456 Oak Ave", "Portland", "OR", "97201", "US", true);
        CustomerDTO c3 = new CustomerDTO(1L, "John", "Doe", "john@example.com", "555-9999",
            "789 Pine Rd", "Seattle", "WA", "98101", "US", true);

        System.out.println(c1);
        System.out.println(c2);
        System.out.println("c1 equals c3: " + c1.equals(c3));
        System.out.println("c1 equals c2: " + c1.equals(c2));
        System.out.println("Full name: " + c1.getFullName());
    }
}
