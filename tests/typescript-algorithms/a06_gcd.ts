function gcd(a: number, b: number): number {
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

function main(): void {
  console.log(gcd(48, 18));
  console.log(lcm(12, 18));
}

main();
