
#ifndef __KTEST_H__
#define __KTEST_H__

#include <stdint.h>
#include <stdbool.h>

enum e_ktstatus {
	PASS = 1,
	FAIL = 0,
};

typedef struct {
	bool on;
	uint64_t data;
	const char *tag;
} kthook_t;

extern kthook_t kthook;

struct {
	int line;
	int ntest;
	int npass;
	int nfails;
	int status;
	const char *file;
	const char *msg;
	const char *stmt;
} test;

/* Test APIs */
#define TEST_INT_EQUAL(EXPT, ACT, HOOK_TAG, HOOK_DATA)    \
    do {                                                  \
        ASSERT_INT(EXPT, ACT, HOOK_TAG, HOOK_DATA);       \
    } while(0);

#define EXPECT_INT_EQUAL(EXPT, ACT, HOOK_TAG, HOOK_DATA)  \
    do {                                                  \
        EXPECT_TYPE(EXPT, ACT, HOOK_TAG, HOOK_DATA);      \
    } while(0);

#define TEST_BOOL_EQUAL(EXPT, ACT, HOOK_TAG, HOOK_DATA)   \
    do {                                                  \
        ASSERT_INT(EXPT, ACT, HOOK_TAG, HOOK_DATA);       \
    } while(0);

#define TEST_STRING_EQUAL(EXPT, ACT, HOOK_TAG, HOOK_DATA) \
    do {                                                  \
        ASSERT_STRING(EXPT, ACT, HOOK_TAG, HOOK_DATA);    \
    } while(0);

/* Worker macros */
#define ASSERT(STMT, HOOK_TAG, HOOK_DATA)                                                            \
    do {                                                                                             \
        int ktretval = -1;                                                                           \
        printf(BBLU "Case %d:" YLW " %s" RST "\n", ++(test.ntest), #STMT);                           \
        ktest_register_hook(__FILE__, __LINE__, HOOK_TAG, (uint64_t) HOOK_DATA);                     \
        ktretval = ((STMT) ? PASS : FAIL); /* calling user function */                               \
        if (ktretval == FAIL) {                                                                      \
            KT_PRINT_ASRTERR(__FILE__, __LINE__, #STMT);                                             \
            ktest_update_result(__FILE__, __LINE__, (#STMT), (#STMT), ktretval);                     \
            return;                                                                                  \
        } else {                                                                                     \
            KT_PRINT_ASRTDBG(__FILE__, __LINE__, #STMT);                                             \
            ktest_update_result(__FILE__, __LINE__, (#STMT), (#STMT), ktretval);                     \
        }                                                                                            \
    } while(0);

#define ASSERT_INT(EXPT, STMT, HOOK_TAG, HOOK_DATA)                                                  \
    do {                                                                                             \
        int ktretval = -1, ACT = -1;                                                                 \
        printf(BBLU "Case %d:" YLW " %s" RST "\n", ++(test.ntest), #STMT);                           \
        ktest_register_hook(__FILE__, __LINE__, HOOK_TAG, (uint64_t) HOOK_DATA);                     \
        ACT = (STMT); /* calling user function */                                                    \
        ktretval = ((EXPT == ACT) ? PASS : FAIL); /* calling user function */                        \
        if (ktretval == FAIL) {                                                                      \
            KT_PRINT_ERROR(__FILE__, __LINE__, #EXPT, #STMT);                                        \
            printf(BLU "        Expected : " RST "(%d)" BLU " Actual: " RST "(%d)\n", EXPT, ACT);    \
            ktest_update_result(__FILE__, __LINE__, (#STMT), (#STMT), ktretval);                     \
            return;                                                                                  \
        } else {                                                                                     \
            KT_PRINT_DEBUG(__FILE__, __LINE__, #EXPT, #STMT);                                        \
            ktest_update_result(__FILE__, __LINE__, (#STMT), (#STMT), ktretval);                     \
        }                                                                                            \
    } while(0);

#define ASSERT_STRING(EXPT, STMT, HOOK_TAG, HOOK_DATA)                                               \
    do {                                                                                             \
        int ktretval = -1, ACT = -1;                                                                 \
        printf(BBLU "Case %d:" YLW " %s" RST "\n", ++(test.ntest), #STMT);                           \
        ktest_register_hook(__FILE__, __LINE__, HOOK_TAG, (uint64_t) HOOK_DATA);                     \
        ACT = (strcmp((EXPT), (STMT)) == 0); /* calling user function */                             \
        ktretval = (ACT ? PASS : FAIL);                                                              \
        if (ktretval == FAIL) {                                                                      \
            KT_PRINT_ERROR(__FILE__, __LINE__, #EXPT, #STMT);                                        \
            printf(BLU "        Expected : " RST "(%s)" BLU " Actual: " RST "(%s)\n", #EXPT, #STMT); \
            ktest_update_result(__FILE__, __LINE__, (#STMT), (#STMT), ktretval);                     \
            return;                                                                                  \
        } else {                                                                                     \
            KT_PRINT_DEBUG(__FILE__, __LINE__, #EXPT, #STMT);                                        \
            ktest_update_result(__FILE__, __LINE__, (#STMT), (#STMT), ktretval);                     \
        }                                                                                            \
    } while(0);

#define EXPECT_TYPE(EXPT, STMT, HOOK_TAG, HOOK_DATA)                                                 \
    do {                                                                                             \
        int ktretval = -1, ACT = -1;                                                                 \
        printf(BBLU "Case %d:" YLW " %s" RST "\n", ++(test.ntest), #STMT);                           \
        ktest_register_hook(__FILE__, __LINE__, HOOK_TAG, (uint64_t) HOOK_DATA);                     \
        ACT = (STMT); /* calling user function */                                                    \
        ktretval = ((EXPT == ACT) ? PASS : FAIL); /* calling user function */                        \
        if (ktretval == FAIL) {                                                                      \
            printf(RED "        ERROR:" CYN " %s:%d " YLW "((%s) == (%s))\n" RST,                    \
                                               __FILE__, __LINE__, #EXPT, #STMT);                    \
            printf(BLU "        Expected : " RST "(%d)" BLU " Actual: " RST "(%d)\n", EXPT, ACT);    \
            ktest_update_result(__FILE__, __LINE__, (#STMT), (#STMT), ktretval);                     \
        } else {                                                                                     \
            ktest_update_result(__FILE__, __LINE__, (#STMT), (#STMT), ktretval);                     \
        }                                                                                            \
    } while(0);

/* Ktest hook object */
#define KTEST_SETUP_HOOK(tagname, type, var)                                   \
{                                                                              \
    if ((kthook.on == true) && (strcmp(kthook.tag, tagname) == 0)) {           \
        printf(BLU "        Applying Hook: '%s'\n" RST, tagname);              \
        var = (type) ktest_setup_hook(__func__, __FILE__, __LINE__, tagname);  \
    }                                                                          \
}

/* User interfaces */
#define TEST_REPORT() ktest_report()
#define RUN(test_function) ktest_worker((#test_function), (test_function))

/* call function without retval check
   used to call void functions     */
#define KT_VCALL(API)                   \
    do {                                \
        printf("KT_CALL: %s\n", #API);  \
        API;                            \
    } while(0);

/* call function and check retval */
#define KT_CALL(API)                                                   \
    do {                                                               \
        int ktret = -1;                                                \
        printf("KT_CALL: %s\n", #API);                                 \
        ktret = API;                                                   \
        if (ktret < 0) {                                               \
            fprintf(stderr, "\nERROR: %s:%d %s :: %s failed !!!\n\n",  \
                                 __FILE__, __LINE__, __func__, #API);  \
            return;                                                    \
        }                                                              \
    } while(0);

/* debug apis */
#define KT_PRINT_ASRTERR(KTF, KTL, KTS)    (printf(RED "        ERROR:" CYN " %s:%d " YLW "(%s)\n" RST, KTF, KTL, KTS))
#define KT_PRINT_ASRTDBG(KTF, KTL, KTS)    (printf(BLU "        DEBUG:" CYN " %s:%d " YLW "(%s)\n" RST, KTF, KTL, KTS))
#define KT_PRINT_ERROR(KTF, KTL, KTE, KTS) (printf(RED "        ERROR:" CYN " %s:%d " YLW "((%s) == (%s))\n" RST, KTF, KTL, KTE, KTS))
#define KT_PRINT_DEBUG(KTF, KTL, KTE, KTS) (printf(BLU "        DEBUG:" CYN " %s:%d " YLW "((%s) == (%s))\n" RST, KTF, KTL, KTE, KTS))

/* Reset color */
#define RST  "\e[0m"

/* Regular text */
#define BLK  "\e[0;30m"
#define RED  "\e[0;31m"
#define GRN  "\e[0;32m"
#define YLW  "\e[0;33m"
#define BLU  "\e[0;34m"
#define MAG  "\e[0;35m"
#define CYN  "\e[0;36m"
#define WHT  "\e[0;37m"

/* Regular bold text */
#define BBLK "\e[1;30m"
#define BRED "\e[1;31m"
#define BGRN "\e[1;32m"
#define BYLW "\e[1;33m"
#define BBLU "\e[1;34m"
#define BMAG "\e[1;35m"
#define BCYN "\e[1;36m"
#define BWHT "\e[1;37m"

void ktest_report(void);
void ktest_print_hoook(void);
void ktest_worker(const char *name, void (*test_function)(void));
void ktest_register_hook(const char *file, const int line, const char *tag, uint64_t data);
int  ktest_update_result(const char *file, int line, const char *msg, const char *stmt, int status);
uint64_t ktest_setup_hook(const char *caller, const char *file, const int line, const char *tag);

#endif /* EOF */
