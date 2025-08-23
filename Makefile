# GNU Makefile

PREFIX := $(HOME)/.local

PACKAGE   := Xplore
TARGET    := xplore-build-xref
RELEASE   := 1.0

DIRBIN    := $(PREFIX)/bin
DIRSHARE  := $(PREFIX)/share/xplore-xref

all:

clean:
	rm -rf __xplore index.html

install: uninstall
	mkdir -p $(DIRSHARE)
	cp -r ./html/* $(DIRSHARE)/
	install -Dm 755 ./src/build.py $(DIRBIN)/$(TARGET)

uninstall:
	rm -rvf $(DIRSHARE)
	rm -vf $(DIRBIN)/$(TARGET)

.PHONY: install uninstall
