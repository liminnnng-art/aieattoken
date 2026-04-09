# Java Spring Boot Test Results

**Date**: 2026-04-09
**Note**: Spring Boot tests verify pipeline correctness only (javac requires Spring Framework deps)

## Results

| File | Java Tokens | AETJ Tokens | Savings | Pipeline | javac |
|------|:-----------:|:-----------:|:-------:|:--------:|:-----:|
| UserController | 744 | 433 | **41.8%** | OK | N/A (Spring deps) |
| OrderService | 847 | 548 | **35.3%** | OK | N/A (Spring deps) |

## Aggregate

- **Pipeline success**: 2/2 (100%)
- **Average savings**: 38.6%

## Spring Boot Aliases Added

| Alias | Annotation/Class | cl100k_base | Import |
|-------|-----------------|:-----------:|--------|
| `Sr` | `@RestController` | 1 | org.springframework.web.bind.annotation |
| `Ctl` | `@Controller` | 1 | org.springframework.stereotype |
| `Svc` | `@Service` | 1 | org.springframework.stereotype |
| `Rep` | `@Repository` | 1 | org.springframework.stereotype |
| `Sc` | `@Component` | 1 | org.springframework.stereotype |
| `Aw` | `@GetMapping` | 1 | org.springframework.web.bind.annotation |
| `Um` | `@PutMapping` | 1 | org.springframework.web.bind.annotation |
| `Aut` | `@Autowired` | 1 | org.springframework.beans.factory.annotation |
| `Rp` | `@RequestParam` | 1 | org.springframework.web.bind.annotation |
| `Rs` | `ResponseEntity` | 1 | org.springframework.http |
| `On` | `Optional.ofNullable` | 1 | java.util |

## AETJ Output Sample (UserController)

```
!java-v1;@UserController{!List<User> users=new ArrayList<>();
long nextId=1;
+getAllUsers()->ResponseEntity<List<User>>{ResponseEntity.ok(users)};
+getUserById(long id)->ResponseEntity<User>{
  users.stream().filter({u|u.getId()==id}).findFirst()
  .map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build())};
...}
```
