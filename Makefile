# GNU Makefile

PREFIX := $(HOME)/.local

PACKAGE   := Xplore
TARGET    := xplore-build
RELEASE   := 1.0

DIRBIN    := $(PREFIX)/bin
DIRSHARE  := $(PREFIX)/share/xplore-monaco

all:

clean:
	rm -rf __xplore index.html

install: uninstall
	mkdir -p $(DIRSHARE)
	cp -r ./html/* $(DIRSHARE)/
	install -m 755 ./src/build.py $(DIRBIN)/$(TARGET)

uninstall:
	rm -rf $(DIRSHARE)
	rm -f $(DIRBIN)/$(TARGET)

.PHONY: install uninstall
