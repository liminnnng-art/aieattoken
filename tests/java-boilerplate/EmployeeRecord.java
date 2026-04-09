import java.util.Objects;
import java.util.List;
import java.util.ArrayList;

public class EmployeeRecord {
    private Long id;
    private String firstName;
    private String lastName;
    private String department;
    private String title;
    private double salary;
    private String managerId;
    private boolean fullTime;

    public EmployeeRecord() {}

    public EmployeeRecord(Long id, String firstName, String lastName, String department,
                          String title, double salary, String managerId, boolean fullTime) {
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
        this.department = department;
        this.title = title;
        this.salary = salary;
        this.managerId = managerId;
        this.fullTime = fullTime;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getFirstName() { return firstName; }
    public void setFirstName(String firstName) { this.firstName = firstName; }
    public String getLastName() { return lastName; }
    public void setLastName(String lastName) { this.lastName = lastName; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public double getSalary() { return salary; }
    public void setSalary(double salary) { this.salary = salary; }
    public String getManagerId() { return managerId; }
    public void setManagerId(String managerId) { this.managerId = managerId; }
    public boolean isFullTime() { return fullTime; }
    public void setFullTime(boolean fullTime) { this.fullTime = fullTime; }

    public String getFullName() {
        return firstName + " " + lastName;
    }

    public double getAnnualSalary() {
        return salary * 12;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        EmployeeRecord that = (EmployeeRecord) o;
        return Objects.equals(id, that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    @Override
    public String toString() {
        return "Employee{id=" + id + ", name='" + getFullName() + "', dept='" + department +
               "', title='" + title + "', salary=" + String.format("%.0f", salary) + "}";
    }

    public static void main(String[] args) {
        List<EmployeeRecord> employees = new ArrayList<>();
        employees.add(new EmployeeRecord(1L, "Alice", "Johnson", "Engineering", "Senior Dev", 12000, null, true));
        employees.add(new EmployeeRecord(2L, "Bob", "Smith", "Engineering", "Dev", 9000, "1", true));
        employees.add(new EmployeeRecord(3L, "Carol", "White", "Marketing", "Manager", 11000, null, true));
        employees.add(new EmployeeRecord(4L, "Dave", "Brown", "Engineering", "Intern", 3000, "1", false));

        for (EmployeeRecord e : employees) {
            System.out.println(e + " | annual=" + String.format("%.0f", e.getAnnualSalary()));
        }

        System.out.println("e1 equals e1: " + employees.get(0).equals(employees.get(0)));
        System.out.println("e1 equals e2: " + employees.get(0).equals(employees.get(1)));
    }
}
