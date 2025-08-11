
#include "ktest.h"
#include <stdio.h>
#include <string.h>

void test_int(void)
{
	TEST_INT_EQUAL(4, 4, NULL, NULL);
	//TEST_INT_EQUAL(4, -1, NULL, NULL); /* FAIL */
	TEST_INT_EQUAL('a', 'a', NULL, NULL);
	//TEST_INT_EQUAL('a', 'b', NULL, NULL); /* FAIL */

	return;
}

void test_bool(void)
{
	TEST_BOOL_EQUAL(true, true,  NULL, NULL);
	TEST_BOOL_EQUAL(false, false, NULL, NULL);
	//TEST_BOOL_EQUAL(true, false, NULL, NULL); /* FAIL */
	//TEST_BOOL_EQUAL(false, true, NULL, NULL); /* FAIL */

	return;
}

void test_string(void)
{
	TEST_STRING_EQUAL("Hello",  "Hello", NULL, NULL);
	//TEST_STRING_EQUAL("Helo", "Hello", NULL, NULL); /* FAIL */
	TEST_STRING_EQUAL("Hello",  strdup("Hello"), NULL, NULL);
	//TEST_STRING_EQUAL("Helo", strdup("Hello"), NULL, NULL); /* FAIL */

	return;
}

void test_assert(void)
{
	ASSERT(2 == 2, NULL, NULL);
	ASSERT(1 != 2, NULL, NULL);
	//ASSERT(1 != 1, NULL, NULL); /* FAIL */
	//ASSERT(1 == 2, NULL, NULL); /* FAIL */
	ASSERT(false == false, NULL, NULL);
	//ASSERT(false == true, NULL, NULL); /* FAIL */
	ASSERT(0 == strcmp("Hello", "Hello"), NULL, NULL);
	ASSERT(0 != strcmp("World", strdup("Work")), NULL, NULL);
	//ASSERT(0 == strcmp("World", strdup("Work")), NULL, NULL); /* FAIL */

	return;
}

int main(int argc, char **argv)
{
	RUN(test_int);
	RUN(test_bool);
	RUN(test_string);
	RUN(test_assert);

	TEST_REPORT();

	return 0;
}

/* EOF */
