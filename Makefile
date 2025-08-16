# GNU Makefile

PREFIX := $(HOME)/.local

PACKAGE   := Ktree
TARGET    := ktree-monaco
RELEASE   := 1.0

DIRBIN    := $(PREFIX)/bin
DIRSHARE  := $(PREFIX)/share/ktree-monaco

all:

clean:
	rm -rf __ktree index.html

install: uninstall
	mkdir -p $(DIRSHARE)
	cp -r ./html/* $(DIRSHARE)/
	install -m 755 ./src/build.py $(DIRBIN)/$(TARGET).py

uninstall:
	rm -rf $(DIRSHARE)
	rm -f $(DIRBIN)/$(TARGET).py

.PHONY: install uninstall
