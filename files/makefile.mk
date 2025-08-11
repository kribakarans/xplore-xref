
#*********************************************#
#                                             #
#    GNU Makefile to build Ktest framework    #
#                                             #
#*********************************************#

PACKAGE      :=  $(shell grep PACKAGE_NAME     libktest/include/version.h | cut -d '"' -f 2)
ELFNAME      :=  $(shell grep PACKAGE_BINARY   libktest/include/version.h | cut -d '"' -f 2)
RELEASE      :=  $(shell grep PACKAGE_RELEASE  libktest/include/version.h | cut -d '"' -f 2)
REVISION     :=  $(shell grep PACKAGE_REVISION libktest/include/version.h | cut -d '"' -f 2)
VERSION      :=  $(RELEASE)-$(REVISION)

SUBDIRS      :=  libktest

DISTDIR      :=  dist
BUILDDIR     :=  build
BUILDSCRIPTS :=  $(BUILDDIR)/scripts
PKGBUILDDIR  :=  $(BUILDDIR)/$(ELFNAME)-build
BOLD         :=  $(shell tput bold)
NC           :=  $(shell tput sgr0)
DATETIME     :=  $(shell date +"%Y%m%d")
ARCHIVENAME  :=  ../$(ELFNAME)-$(VERSION)-$(DATETIME)

ifneq (,$(wildcard $(HOME)/.termux))
    PLATFORM  =  TERMUX
else
    PLATFORM  =  HOST
endif

# Iterate each directories and run make command:
all install uninstall clean:
	@set -e ;
	@for DIR in $(SUBDIRS) ; do                          \
	    $(MAKE) --no-print-directory -C "$${DIR}" $(@) ; \
	done

dist:
	@kdebuild --dpkg

distclean cfgclean: clean
	rm -rf $(PKGBUILDDIR) $(DISTDIR)/*
	rm -rf $(HOME)/.termux-build/$(ELFNAME) __ktags

backup: distclean
	@printf "Archiving ... $(BOLD)$(PACKAGE) v$(VERSION)"
	@cp  -prf . $(ARCHIVENAME)
	@tar --exclude='obj'   \
	     --exclude='*.swp' \
	     --exclude='*.swo' \
	     -czf $(ARCHIVENAME).tgz $(ARCHIVENAME) 2> /dev/null
	@rm -rf $(ARCHIVENAME)
	@printf "\33[2K\r\nArchived to $(BOLD)$(ARCHIVENAME).tgz$(NC)\n"

.PHONY: all backup build clean dist distclean install uninstall

#EOF
