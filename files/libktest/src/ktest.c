
#include "ktest.h"

#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <string.h>

#define DEBUG_EXPRESSION() (printf(BMAG "        DEBUG" CYN " %s:%d " YLW "%s\n" RST, test.file, test.line, test.stmt))

kthook_t kthook;

void ktest_print_hoook(void)
{
	printf("Setting Hook object: Tag '%s' Data '%lx'\n", kthook.tag, kthook.data);

	return;
}

uint64_t ktest_setup_hook(const char *caller, const char *file, const int line, const char *tag)
{
	assert(tag != NULL);

	if (strcmp(kthook.tag, tag) != 0) {
		printf("\nKTEST_HOOK_TAG mismatch !!! Expected '%s' Actual '%s' (%s :: %s:%d)\n", kthook.tag, tag, caller, file, line);
		printf("Aborting program !!!\n");
		abort();
	}

	return kthook.data;
}

void ktest_register_hook(const char *file, const int line, const char *tag, uint64_t data)
{
	memset(&kthook, 0x00, sizeof kthook);

	if (tag != NULL) {
		kthook.on   = true;
		kthook.tag  = tag;
		kthook.data = data;

		printf(BYLW "KTSET_HOOK:" YLW " %s " "(%lx)\n" RST, tag, data);
	}

	return;
}

int ktest_update_result(const char *file, int line, const char *msg, const char *stmt, int status)
{
	test.file = file;
	test.line = line;
	test.msg  = msg;
	test.stmt = stmt;
	test.status = status;

	//DEBUG_EXPRESSION();

	if (test.status == PASS) {
		test.npass++;
		printf(BLU "      > " BGRN "PASS" RST "\n\n");
	} else {
		test.nfails++;
		printf(BLU "      > " BRED "FAIL" RST "\n\n");
	}

	return status;
}

void ktest_worker(const char *name, void (*test_function)(void))
{
	printf(BBLU "\nTEST SUITE: " BYLW "%s" RST "\n", name);

	test_function(); /* callback test function */

	return;
}

void ktest_report(void)
{
	printf(BBLU "KTEST REPORT:" RST "\n");
	printf(BLU  "    Total  : " RST "%d\n", test.ntest);
	printf(GRN  "    Passed : " RST "%d\n", test.npass);
	printf(RED  "    Failed : " RST "%d\n", test.nfails);

	return;
}

/* EOF */
