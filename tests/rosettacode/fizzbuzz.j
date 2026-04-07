NB. FizzBuzz 1 to 100
fb =: (":)`('Fizz'"_)`('Buzz'"_)`('FizzBuzz'"_)@.(0 1 2 3{~0&~:@(3&|)+2*0&~:@(5&|))
echo fb"0 >:i.100
exit 0
