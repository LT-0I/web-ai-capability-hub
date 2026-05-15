python_code = """# A simple Python script to print the first 10 prime numbers.

def is_prime(n):
    if n <= 1:
        return False
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0:
            return False
    return True

def main():
    count = 0
    num = 2
    while count < 10:
        if is_prime(num):
            print(num)
            count += 1
        num += 1

if __name__ == "__main__":
    main()
"""

with open("primes.py", "w") as f:
    f.write(python_code)