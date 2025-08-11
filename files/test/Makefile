
#*******************************************#
#                                           #
#    GNU Makefile to build Ktest binary     #
#                                           #
#*******************************************#

PKGNAME  :=  Ktest
ELFNAME  :=  ktest
TARGET   :=  $(ELFNAME).out

PREFIX   ?= /usr/local
SRCDIR   :=  src
OBJDIR   :=  obj
LIBDIR   :=  ../libktest

CC       ?=  gcc
CFLAGS   := -g -O3 -MMD -fPIE
CPPFLAGS := -Wdate-time -D_FORTIFY_SOURCE=2
WFLAGS   := -Wall -Wextra -Wno-unused-parameter -Werror
WFLAGS   += -Wno-pedantic -Wtraditional-conversion -Wstrict-prototypes \
            -Wformat=2 -Wformat-overflow=2 -Wformat-truncation=2 -Wformat-security -Wnull-dereference -Wstack-protector \
            -Wtrampolines -Walloca -Wvla -Warray-bounds=2 -Wimplicit-fallthrough=3 -Wshift-overflow=2 -Wcast-qual \
            -Wstringop-overflow=4 -Wconversion -Wint-conversion -Wlogical-op -Wduplicated-cond -Wduplicated-branches \
            -Wformat-signedness -Wshadow -Wstrict-overflow=4 -Wundef -Wswitch-default -Wswitch-enum -Wstack-usage=4096 -Wcast-align=strict
INCLUDE  += -I$(LIBDIR)/src
LDFLAGS  += -Wl,-z,relro -Wl,-z,now -Wl,-z,noexecstack -Wl,-z,separate-code -Wl,-Bsymbolic-functions
LDFLAGS  += -Wl,-rpath=$(LIBDIR)/libs -L$(LIBDIR)/libs
LDLIBS   += -lktest

FSTACK  := -fstack-protector-all -fstack-protector-strong -fstack-clash-protection
FASAN   := -fsanitize=address -fsanitize=pointer-compare -fsanitize=pointer-subtract -fsanitize=leak -fno-omit-frame-pointer \
           -fsanitize=undefined -fsanitize=bounds-strict -fsanitize=float-divide-by-zero -fsanitize=float-cast-overflow
CFLAGS  += $(FSTACK) $(FASAN)
LDFLAGS += $(FASAN)

ifneq (,$(wildcard $(HOME)/.termux))
    CPPFLAGS += -DTERMUX
else
    CPPFLAGS +=
endif

BOLD := $(shell tput bold)
NC   := $(shell tput sgr0)

# Source files
SRCS := $(SRCDIR)/ktest_usage.c

# Object files
OBJS := $(SRCS:%.c=$(OBJDIR)/%.o)

# Build dependencies
DEPS := $(OBJS:%.o=%.d)

# Makefile execution starts here
all: info $(TARGET)

info:
	@echo "\n$(BOLD)Building $(PKGNAME) ...$(NC)"

# Link object files and generate executable
$(TARGET): $(OBJS)
	@echo  "\n$(BOLD)Linking object files ...$(NC)"
	$(CC) -o $(TARGET) $(OBJS) $(LDFLAGS) $(LDLIBS)
	@echo "$(PKGNAME) build completed [$(TARGET)]"

# Build object file for each .c file
SYSBINDIR :=  $(PREFIX)/bin
$(OBJDIR)/%.o : %.c
	@mkdir -p $(@D)
	$(CC) $(CFLAGS) $(WFLAGS) $(CPPFLAGS) $(INCLUDE) -c $< -o $@

install:
	install -D $(TARGET) $(DESTDIR)$(SYSBINDIR)/$(ELFNAME)

uninstall:
	rm -f $(DESTDIR)$(SYSBINDIR)/$(ELFNAME)

KTAGSDIR  := __ktags
COREFILES := core vgcore*
clean:
	rm -rf $(TARGET) $(OBJDIR) $(COREFILES) $(KTAGSDIR)

-include $(DEPS)

.PHONY: all clean info install uninstall 

#EOMake
