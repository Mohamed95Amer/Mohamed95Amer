FROM odoo:18.0

USER root

# rtlcss builds the Arabic stylesheet. Without it Odoo still serves a bundle
# named .rtl.min.css, but it is the left-to-right sheet under a right-to-left
# name — so Arabic text sits in an English layout, and the failure is silent
# apart from one warning per asset build. Since the product ships Arabic as a
# first-class language, this belongs in the image rather than in a runbook.
RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm \
    && npm install -g rtlcss \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-oca.txt /tmp/requirements-oca.txt
RUN pip3 install \
    --no-cache-dir \
    --break-system-packages \
    --trusted-host pypi.org \
    --trusted-host files.pythonhosted.org \
    -r /tmp/requirements-oca.txt

USER odoo
