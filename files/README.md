
# Ktest: Simple C/C++ unit-test framework

Ktest provides a simple unit-test framework for C/C++ based projects.

# Features:
1. Simple Test suite interfaces
2. No dependencies and completely written in C
3. Pretty good test report with colored output
4. Support Hooking to override the return values of function calls or an expressions in the production code

# APIs:
- `TEST_REPORT()` -- Print final Test report
- `RUN(test_function)` -- Run Testsuite, the collection of test cases
- `test_function()` -- Function that contains the test cases

# TEST APIs:
- `ASSERT(expr,  hook_tag, hook_value)`
- `TEST_INT_EQUAL(int a, int b,  hook_tag, hook_value)`
- `TEST_BOOL_EQUAL(int a, int b,  hook_tag, hook_value)`
- `TEST_STRING_EQUAL(int a, int b,  hook_tag, hook_value)`
- `KTEST_SETUP_HOOK(hook_tag, dest_datatype, dest_variable)`

# Usage:
1. Build Ktest from here and do `make` and `make install`
    - Library files will be save at `/usr/local/lib`
    - Header files will be save at `/usr/local/include`
2. Compile the code with `gcc file.c -Wl,-rpath=/usr/local/lib/ -lktest`
3. Your code is ready to test

# Example:
```
TEST_INT_EQUAL(4,  4,  NULL, NULL);
TEST_INT_EQUAL(4, -1,  NULL, NULL); /* FAIL */

TEST_BOOL_EQUAL(true, true, NULL, NULL);

TEST_STRING_EQUAL("Hello", "Hello", NULL, NULL);

ASSERT(2 == 2, NULL, NULL);
ASSERT(0 != strcmp("World", strdup("Work")), NULL, NULL);
```
