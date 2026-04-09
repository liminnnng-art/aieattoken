import java.util.Objects;

public class AddressVO {
    private final String street;
    private final String city;
    private final String state;
    private final String zipCode;
    private final String country;

    public AddressVO(String street, String city, String state, String zipCode, String country) {
        this.street = street;
        this.city = city;
        this.state = state;
        this.zipCode = zipCode;
        this.country = country;
    }

    public String getStreet() { return street; }
    public String getCity() { return city; }
    public String getState() { return state; }
    public String getZipCode() { return zipCode; }
    public String getCountry() { return country; }

    public String getFullAddress() {
        return street + ", " + city + ", " + state + " " + zipCode + ", " + country;
    }

    public AddressVO withStreet(String newStreet) {
        return new AddressVO(newStreet, city, state, zipCode, country);
    }

    public AddressVO withCity(String newCity) {
        return new AddressVO(street, newCity, state, zipCode, country);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        AddressVO that = (AddressVO) o;
        return Objects.equals(street, that.street) && Objects.equals(city, that.city) &&
               Objects.equals(state, that.state) && Objects.equals(zipCode, that.zipCode) &&
               Objects.equals(country, that.country);
    }

    @Override
    public int hashCode() {
        return Objects.hash(street, city, state, zipCode, country);
    }

    @Override
    public String toString() {
        return "Address{" + getFullAddress() + "}";
    }

    public static void main(String[] args) {
        AddressVO a1 = new AddressVO("123 Main St", "Springfield", "IL", "62704", "US");
        AddressVO a2 = a1.withCity("Chicago");
        AddressVO a3 = new AddressVO("123 Main St", "Springfield", "IL", "62704", "US");

        System.out.println(a1);
        System.out.println(a2);
        System.out.println("a1 equals a3: " + a1.equals(a3));
        System.out.println("a1 equals a2: " + a1.equals(a2));
        System.out.println("Full: " + a1.getFullAddress());
    }
}
