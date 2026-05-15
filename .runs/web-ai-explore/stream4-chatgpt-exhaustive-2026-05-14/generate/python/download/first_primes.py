def is_prime(n):
    """Return True if n is a prime number."""
    if n < 2:
        return False
    for divisor in range(2, int(n ** 0.5) + 1):
        if n % divisor == 0:
            return False
    return True


def first_primes(count):
    """Return the first `count` prime numbers."""
    primes = []
    number = 2
    while len(primes) < count:
        if is_prime(number):
            primes.append(number)
        number += 1
    return primes


if __name__ == "__main__":
    print(first_primes(10))
