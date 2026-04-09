import java.util.*;
import java.util.Collections;

public class B08_csv {

    public static void check(String label, boolean cond) {
        var status = cond ? "PASS" : "FAIL";
        System.out.println("  " + label + ": " + status);
        if (cond) {
            ++passed;
        } else {
            ++failed;
        }

    }

    public static void main(String[] args) {
        var parser = new CsvParser();
        System.out.println("=== Basic CSV Parsing ===");
        var csv1 = "name,age,city\nAlice,30,New York\nBob,25,Chicago\nCharlie,35,Boston";
        List<List<String>> rows = parser.parse(csv1);
        System.out.println("Parsed " + rows.size() + " rows:");
        for (var row : rows) {
            System.out.println("  " + row);
        }
        check("Row count", rows.size() == 4);
        check("Header fields", rows.get(0).equals(List.of("name", "age", "city")));
        check("Data row 1", rows.get(1).equals(List.of("Alice", "30", "New York")));
        System.out.println("\n=== Quoted Fields ===");
        var csv2 = "name,description,value\n\"Smith, John\",\"He said \"\"hello\"\"\",100\n\"O'Brien\",\"Line1\",200";
        List<List<String>> rows2 = parser.parse(csv2);
        for (var row : rows2) {
            System.out.println("  " + row);
        }
        check("Quoted comma", rows2.get(1).get(0).equals("Smith, John"));
        check("Escaped quotes", rows2.get(1).get(1).equals("He said \"hello\""));
        check("Simple quoted", rows2.get(2).get(0).equals("O'Brien"));
        System.out.println("\n=== Header-based Parsing ===");
        var csv3 = "id,product,price\n1,Widget,9.99\n2,Gadget,19.99\n3,Gizmo,29.99";
        List<Map<String, String>> records = parser.parseWithHeader(csv3);
        System.out.println("Records:");
        for (var rec : records) {
            System.out.println("  " + rec);
        }
        check("Record count", records.size() == 3);
        check("First product", "Widget".equals(records.get(0).get("product")));
        check("Last price", "29.99".equals(records.get(2).get("price")));
        check("ID field", "2".equals(records.get(1).get("id")));
        System.out.println("\n=== Edge Cases ===");
        check("Empty input", parser.parse("").isEmpty());
        check("Null input", parser.parse(null).isEmpty());
        var singleField = "hello";
        List<List<String>> single = parser.parse(singleField);
        check("Single field", single.size() == 1 && single.get(0).equals(List.of("hello")));
        var emptyFields = "a,,b,";
        List<List<String>> empty = parser.parse(emptyFields);
        check("Empty fields count", empty.get(0).size() == 4);
        check("Empty field value", empty.get(0).get(1).isEmpty());
        System.out.printf("%n=== Results: %d passed, %d failed ===%n", passed, failed);

    }

    static int passed = 0;

    static int failed = 0;

    static class CsvParser {
        private final char delimiter;
        private final char quote;

        public CsvParser(char delimiter, char quote) {
            this.delimiter = delimiter;
            this.quote = quote;
        }

        public CsvParser() {
            this(',', '"');

        }

        public List<List<String>> parse(String input) {
            List<List<String>> rows = new ArrayList<>();
            if (input == null || input.isEmpty()) {
                return rows;
            }
            var lines = splitLines(input);
            for (var line : lines) {
                if (!line.isEmpty()) {
                    rows.add(parseLine(line));
                }
            }
            return rows;

        }

        private String[] splitLines(String input) {
            List<String> lines = new ArrayList<>();
            var current = new StringBuilder();
            var inQuotes = false;
            for (var i = 0; i < input.length(); ++i) {
                var c = input.charAt(i);
                if (c == quote) {
                    inQuotes = !inQuotes;
                    current.append(c);
                } else if ((c == '\n' || c == '\r') && !inQuotes) {
    if (c == '\r' && i + 1 < input.length() && input.charAt(i + 1) == '\n') {
        ++i;
    }
    lines.add(current.toString());
    current = new StringBuilder();
} else {
    current.append(c);
}
            }
            if (!current.isEmpty()) {
                lines.add(current.toString());
            }
            return lines.toArray(new String[0]);

        }

        private List<String> parseLine(String line) {
            List<String> fields = new ArrayList<>();
            var field = new StringBuilder();
            var inQuotes = false;
            var i = 0;
            while (i < line.length()) {
                var c = line.charAt(i);
                if (inQuotes) {
                    if (c == quote) {
                        if (i + 1 < line.length() && line.charAt(i + 1) == quote) {
                            field.append(quote);
                            i += 2;
                        } else {
                            inQuotes = false;
                            ++i;
                        }
                    } else {
                        field.append(c);
                        ++i;
                    }
                } else {
                    if (c == quote) {
                        inQuotes = true;
                        ++i;
                    } else if (c == delimiter) {
    fields.add(field.toString());
    field = new StringBuilder();
    ++i;
} else {
    field.append(c);
    ++i;
}
                }
            }
            fields.add(field.toString());
            return fields;

        }

        public List<Map<String, String>> parseWithHeader(String input) {
            List<List<String>> rows = parse(input);
            if (rows.size() < 2) {
                return Collections.emptyList();
            }
            List<String> headers = rows.get(0);
            List<Map<String, String>> result = new ArrayList<>();
            for (var i = 1; i < rows.size(); ++i) {
                Map<String, String> record = new LinkedHashMap<>();
                List<String> row = rows.get(i);
                for (var j = 0; j < headers.size(); ++j) {
                    record.put(headers.get(j), j < row.size() ? row.get(j) : "");
                }
                result.add(record);
            }
            return result;

        }
    }
}
