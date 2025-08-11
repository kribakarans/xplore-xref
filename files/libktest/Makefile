
#*************************************************#
#                                                 #
#    GNU Makefile to build libktest.so library    #
#                                                 #
#*************************************************#

MAJOR   := 1
MINOR   := 0
PATCH   := 0
VERSION := $(MAJOR).$(MINOR)

PKGNAME := $(shell grep PACKAGE_NAME   include/version.h | cut -d '"' -f 2)
ELFNAME := $(shell grep PACKAGE_BINARY include/version.h | cut -d '"' -f 2)
LIBNAME := lib$(ELFNAME)
LIBAR   := $(LIBNAME).a
LIBSO   := $(LIBNAME).so
LIBSOM  := $(LIBSO).$(MAJOR)
LIBSOV  := $(LIBSO).$(VERSION)


CC       ?=  gcc
CFLAGS   := -g -O3 -MMD -fPIE
CPPFLAGS := -Wdate-time -D_FORTIFY_SOURCE=2
WFLAGS   := -Wall -Wextra -Wno-unused-parameter -Werror
WFLAGS   += -Wno-pedantic -Wtraditional-conversion -Wstrict-prototypes \
            -Wformat=2 -Wformat-overflow=2 -Wformat-truncation=2 -Wformat-security -Wnull-dereference -Wstack-protector \
            -Wtrampolines -Walloca -Wvla -Warray-bounds=2 -Wimplicit-fallthrough=3 -Wshift-overflow=2 -Wcast-qual \
            -Wstringop-overflow=4 -Wconversion -Wint-conversion -Wlogical-op -Wduplicated-cond -Wduplicated-branches \
            -Wformat-signedness -Wshadow -Wstrict-overflow=4 -Wundef -Wswitch-default -Wswitch-enum -Wstack-usage=4096 -Wcast-align=strict
INCLUDE +=
LDFLAGS += -Wl,-z,relro -Wl,-z,now -Wl,-z,noexecstack -Wl,-z,separate-code -Wl,-Bsymbolic-functions
LDLIBS  +=
FSTACK  := -fstack-protector-all -fstack-protector-strong -fstack-clash-protection
#FASAN  := -fsanitize=address -fsanitize=pointer-compare -fsanitize=pointer-subtract -fsanitize=leak -fno-omit-frame-pointer \
           -fsanitize=undefined -fsanitize=bounds-strict -fsanitize=float-divide-by-zero -fsanitize=float-cast-overflow
CFLAGS  += $(FSTACK) $(FASAN)
LDFLAGS += $(FASAN)

AR      ?= ar
ARFLAGS := rcs
RANLIB  ?= ranlib

ifneq (,$(wildcard $(HOME)/.termux))
    CPPFLAGS += -DTERMUX
else
    CPPFLAGS +=
endif

BOLD   := $(shell tput bold)
NC     := $(shell tput sgr0)

SRCDIR := src
OBJDIR := obj
LIBDIR := libs

# Source files
SRCS := $(SRCDIR)/ktest.c

# Object files
OBJS := $(SRCS:%.c=$(OBJDIR)/%.o)

# Build dependencies
DEPS := $(OBJS:%.o=%.d)

all: info sharedlibrary staticlibrary

info:
	@echo "\n$(BOLD)Building $(PKGNAME) v$(VERSION) ...$(NC)"

# Build static library
staticlibrary: $(OBJS)
	@mkdir -p $(LIBDIR)
	@echo "\n$(BOLD)Building static library ...$(NC)"
	$(AR) $(ARFLAGS) $(LIBDIR)/$(LIBAR) $(OBJS)
	$(RANLIB) $(LIBDIR)/$(LIBAR)

# Build shared library
CFLAGS  += -fPIC
LDFLAGS += -shared -Wl,-soname,$(LIBSOM)
sharedlibrary: $(OBJS)
	@mkdir -p $(LIBDIR)
	@echo "\n$(BOLD)Building shared library ...$(NC)"
	$(CC) -o $(LIBDIR)/$(LIBSOV) $(OBJS) $(LDFLAGS) $(LDLIBS)
	cd $(LIBDIR) &&                  \
	   ln -s -f $(LIBSOV) $(LIBSOM); \
	   ln -s -f $(LIBSOM) $(LIBSO);

# Build object file for each .c file
$(OBJDIR)/%.o: %.c
	@mkdir -p $(@D)
	$(CC) $(CPPFLAGS) $(CFLAGS) $(WFLAGS) $(INCLUDE) -c $< -o $@

PREFIX     ?= /usr/local
SYSLIBDIR  := $(PREFIX)/lib
SYSINCLUDE := $(PREFIX)/include
install:
	install -D -m 644 $(LIBDIR)/$(LIBAR)  $(DESTDIR)$(SYSLIBDIR)/$(LIBAR)
	install -D -m 775 $(LIBDIR)/$(LIBSOV) $(DESTDIR)$(SYSLIBDIR)/$(LIBSOV)
	install -D -m 644 $(SRCDIR)/ktest.h   $(DESTDIR)$(SYSINCLUDE)/ktest.h
	cd $(DESTDIR)$(SYSLIBDIR)   && \
	   ln -sf $(LIBSOV) $(LIBSOM); \
	   ln -sf $(LIBSOM) $(LIBSO);
	@#ldconfig -n $(SYSLIBDIR)

uninstall:
	rm -f $(DESTDIR)$(SYSINCLUDE)/ktest.h
	rm -f $(DESTDIR)$(SYSLIBDIR)/$(LIBSO)*
	rm -f $(DESTDIR)$(SYSLIBDIR)/$(LIBAR)

KTAGSDIR  := __ktags
COREFILES := core vgcore*
clean:
	rm -rf $(OBJDIR) $(LIBDIR)/$(LIBAR) $(LIBDIR)/$(LIBSO)* $(KTAGSDIR)

-include $(DEPS)

.PHONY: all clean sharedlibrary staticlibrary info install uninstall

#EOF
