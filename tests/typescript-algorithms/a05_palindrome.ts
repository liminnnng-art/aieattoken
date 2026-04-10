function isPalindrome(s: string): boolean {
  const cleaned = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  let lo = 0;
  let hi = cleaned.length - 1;
  while (lo < hi) {
    if (cleaned[lo] !== cleaned[hi]) return false;
    lo++;
    hi--;
  }
  return true;
}

function main(): void {
  const tests = ["racecar", "hello", "A man a plan a canal Panama", "Not a palindrome"];
  for (const t of tests) {
    console.log(t + " -> " + isPalindrome(t));
  }
}

main();
